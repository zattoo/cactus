import * as core from '@actions/core';
import parseChangelog from 'changelog-parser';
import {format} from 'date-fns';

import {
    init,
    getPayload,
    createBranch,
    updateFile,
    createPullRequest,
} from './github-api';

const exit = (message, exitCode) => {
    if (exitCode === 1) {
        core.error(message);
    } else {
        core.info(message);
    }

    process.exit(exitCode);
};

const createVersionRaisePullRequest = async ({
    owner,
    repo,
    baseSha,
    project,
    newVersion,
    mergeIntoBranch,
}) => {
    const branch = `next/${project}`;

    await createBranch({
        owner,
        repo,
        branch,
        sha: baseSha,
    });

    const packageJsonPath = `projects/${project}/package.json`;
    const changelogPath = `projects/${project}/CHANGELOG.md`;
    const packageLockPath = 'package-lock.json';

    const updatePackageJson = async () => updateFile({
        owner,
        repo,
        branch,
        path: packageJsonPath,
    }, (rawFile) => {
        const packageJson = JSON.parse(rawFile);

        packageJson.version = newVersion;

        return JSON.stringify(packageJson, null, 4).concat('\n');
    });

    const updatePackageLock = async () => updateFile({
        owner,
        repo,
        branch,
        path: packageLockPath,
    }, (rawFile) => {
        const packageLock = JSON.parse(rawFile);

        packageLock.packages[`projects/${project}`].version = newVersion;

        return JSON.stringify(packageLock, null, 4).concat('\n');
    });

    const updateChangelog = async () => updateFile({
        owner,
        repo,
        branch,
        path: changelogPath,
    }, async (rawFile) => {
        const changelog = await parseChangelog({text: rawFile})

        const highestTitle = changelog.versions[0].title;

        if (!highestTitle.endsWith('Unreleased')) {
            core.info('Skip Changelog: No unreleased version.');

            return null;
        }

        const newVersionEntry = `## [${newVersion}] - Unreleased\n\n...\n\n`;
        const date = format(new Date(), "dd.MM.yyyy")

        const changelogDateCut = rawFile.replace('Unreleased', date);
        const changelogNext = changelogDateCut.replace(/(.+?)(##.+)/s, `$1${newVersionEntry}$2`);

        return changelogNext;
    });

    // sequencial or not?
    await updatePackageLock();
    await updatePackageJson();
    await updateChangelog();

    await createPullRequest({
        owner,
        repo,
        title: `Next ${project}`,
        body: `Bump version`,
        branch,
        base: mergeIntoBranch,
    });
};

(async () => {
    const token = core.getInput('token', {required: true});
    // const labels = core.getMultilineInput('labels', {required: false});
    const project = core.getInput('project', {required: true});
    const newVersion = core.getInput('new-version', {required: true});

    init(token);

    const payload = getPayload();

    const {
        after,
        // before,
        repository,
    } = payload;

    const repo = repository.name;
    const owner = repository.full_name.split('/')[0];

    const defaultBranch = repository.default_branch;

    await createVersionRaisePullRequest({
        owner,
        repo,
        baseSha: after,
        project,
        newVersion,
        mergeIntoBranch: defaultBranch,
    });

    // const commit = await octokit.rest.repos.getCommit({
    //     owner,
    //     repo,
    //     ref: after,
    // });

    // const {files} = commit.data;

    // // console.log({
    // //     labels,
    // //     context,
    // //     payload,
    // //     after,
    // //     before,
    // //     repository,
    // //     repo,
    // //     owner,
    // //     commit,
    // //     data: commit.data,
    // //     files,
    // // });

    // if (isEmpty(files)) {
    //     exit('No changes', 0);
    // }

    // const changelogs = files.filter((file) => file.filename.includes('CHANGELOG.md'));

    // if (isEmpty(changelogs)) {
    //     exit('No changelog changes', 0);
    // }

    // const cut = async (project, item) => {
    //     const {version} = item;
    //     const release = version.slice(0, -2);
    //     const first = Number(version[version.length - 1]) === 0;

    //     // console.log({
    //     //     project,
    //     //     item,
    //     //     version,
    //     //     release,
    //     //     first,
    //     // });

    //     if (!first) {
    //         exit(`This is not a first change to ${release} release`, 0);
    //     }

    //     const rcBranch = `rc/${project}/${version}`;
    //     const releaseBranch = `release/${project}/${release}`;

    //     await Promise.all([
    //         await octokit.rest.git.createRef({
    //             owner,
    //             repo,
    //             ref: `refs/heads/${releaseBranch}`,
    //             sha: before,
    //         }),
    //         await octokit.rest.git.createRef({
    //             owner,
    //             repo,
    //             ref: `refs/heads/${rcBranch}`,
    //             sha: after,
    //         }),
    //     ]);

    //     const body = `## Changelog\n\n${item.body}\n\n`;

    //     const {data: pr} = await octokit.rest.pulls.create({
    //         owner,
    //         repo,
    //         title: `Release ${version}-${project}`,
    //         body,
    //         head: rcBranch,
    //         base: releaseBranch,
    //     })

    //     await octokit.rest.issues.addLabels({
    //         owner,
    //         repo,
    //         issue_number: pr.number,
    //         labels,
    //     });
    // };

    // const processChanges = async (item) => {
    //     const {filename} = item;

    //     const split = filename.split('/');
    //     const project = split[split.length - 2];

    //     core.info(`Analyzing ${project} project...`);

    //     // console.log({
    //     //     item,
    //     //     filename,
    //     //     split,
    //     //     project,
    //     // });

    //     const [contentBefore, contentAfter] = await Promise.all([
    //         await octokit.rest.repos.getContent({
    //             owner,
    //             repo,
    //             path: filename,
    //             ref: before,
    //         }),
    //         await octokit.rest.repos.getContent({
    //             owner,
    //             repo,
    //             path: filename,
    //             ref: after,
    //         }),
    //     ]);

    //     // console.log({
    //     //     contentBefore,
    //     //     contentAfter,
    //     // });

    //     const textBefore = Buffer.from(contentBefore.data.content, 'base64').toString();
    //     const textAfter = Buffer.from(contentAfter.data.content, 'base64').toString();

    //     // console.log({
    //     //     textBefore,
    //     //     textAfter,
    //     // });

    //     const [changelogBefore, changelogAfter] = await Promise.all([
    //         await parseChangelog({text: textBefore}),
    //         await parseChangelog({text: textAfter}),
    //     ]);

    //     // console.log({
    //     //     changelogBefore,
    //     //     changelogAfter,
    //     // });

    //     const newVersions = getNewVersions(project, changelogBefore, changelogAfter);

    //     // console.log({
    //     //     newVersions
    //     // });

    //     if (!isEmpty(newVersions)) {
    //         await Promise.all(newVersions.map((version) => cut(project, version)));
    //     }
    // };

    // await Promise.all(changelogs.map(processChanges));

    // if (!foundSomething) {
    //     exit('No release candidates were found', 0);
    // }
})()
    .catch((error) => {
        console.log(error);
        exit(error, 1);
    });
