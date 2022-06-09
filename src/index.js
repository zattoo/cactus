// const core = require('@actions/core');
import * as core from '@actions/core';
// const exec = require('@actions/exec');
// import * as github from '@actions/github';
// const github = require('@actions/github');
import parseChangelog from 'changelog-parser';
import {format} from 'date-fns';

import {
    init,
    getPayload,
    createBranch,
    getRawFile,
    createCommit,
    createPullRequest,
} from './github-api';
// todo: esm

// let foundSomething = false;

// const isEmpty = (value) => {
//     return (
//         value === undefined ||
//         value === null ||
//         (typeof value === 'object' && Object.keys(value).length === 0) ||
//         (typeof value === 'string' && value.trim().length === 0)
//     );
// };

const exit = (message, exitCode) => {
    if (exitCode === 1) {
        core.error(message);
    } else {
        core.info(message);
    }

    process.exit(exitCode);
};

(async () => {
    const token = core.getInput('token', {required: true});
    // const labels = core.getMultilineInput('labels', {required: false});
    const project = core.getInput('project', {required: true});
    const newVersion = core.getInput('new-version', {required: true});
    // const octokit = github.getOctokit(token);

    init(token);

    // const {context} = github;
    // const {payload} = context;
    const payload = getPayload();

    const {
        after,
        // before,
        repository,
    } = payload;

    const repo = repository.name;
    const owner = repository.full_name.split('/')[0];

    const defaultBranch = repository.default_branch;

    const updateFile = async (path, fileModifier) => {
        const rawContent = await getRawFile({
            owner,
            repo,
            path,
        });

        const modifiedContent = await Promise.resolve(fileModifier(rawContent));

        if (!modifiedContent) {
            return;
        }

        await createCommit({
            owner,
            repo,
            branch,
            path,
            content: modifiedContent,
        });
    };

    const createMainPr = async () => {
        const branch = `next/${project}`;
        const ref = `refs/heads/${branch}`;

        await createBranch({
            owner,
            repo,
            ref,
            sha: after,
        });

        const packageJsonPath = `projects/${project}/package.json`;
        const changelogPath = `projects/${project}/CHANGELOG.md`;
        const packageLockPath = 'package-lock.json';

        // Update version in package.json
        const updatePackageJson = async () => updateFile(packageJsonPath, (rawFile) => {
            const packageJson = JSON.parse(rawFile);

            packageJson.version = newVersion;

            return JSON.stringify(packageJson, null, 4).concat('\n');
        });
        // const updatePackageJson = async () =>  {
        //     const packageJsonString = await getRawFile({
        //         owner,
        //         repo,
        //         path: packageJsonPath,
        //     });

        //     const packageJson = JSON.parse(packageJsonString);

        //     packageJson.version = newVersion;

        //     await createCommit({
        //         owner,
        //         repo,
        //         branch,
        //         path: packageJsonPath,
        //         content: JSON.stringify(packageJson, null, 4).concat('\n'),
        //     });
        // };

        // Update version in package-lock.json
        const updatePackageLock = async () => updateFile(packageLockPath, (rawFile) => {
            const packageLock = JSON.parse(rawFile);

            packageLock.packages[`projects/${project}`].version = newVersion;

            return JSON.stringify(packageLock, null, 4).concat('\n');
        });
        // const updatePackageLock = async () =>  {
        //     const packageLockString = await getRawFile({
        //         owner,
        //         repo,
        //         path: packageLockPath,
        //     });

        //     const packageLockJson = JSON.parse(packageLockString);

        //     packageLockJson.packages[`projects/${project}`].version = newVersion;

        //     await createCommit({
        //         owner,
        //         repo,
        //         branch,
        //         path: packageLockPath,
        //         content: JSON.stringify(packageLockJson, null, 4).concat('\n'),
        //     });
        // };

        const updateChangelog = async () => updateFile(changelogPath, async (rawFile) => {
            const changelog = await parseChangelog({text: rawFile})

            const highestVersionEntry = changelog.versions[0];

            const title = highestVersionEntry.title;

            if (!title.endsWith('Unreleased')) {
                console.log('Skip Changelog: No unreleased version.');
                // todo: core info

                return null;
            }

            const date = format(new Date(), "dd.MM.yyyy")
            const changelogStringCut = changelogString.replace('Unreleased', date);

            const newVersionEntry = `## [${newVersion}] - Unreleased\n\n...\n\n`;

            const updatedChangelog = changelogStringCut.replace(/(.+?)(##.+)/s, `$1${newVersionEntry}$2`);

            return updatedChangelog;
        });
        // const updateChangelog = async () => {

        //     const changelogString = await getRawFile({
        //         owner,
        //         repo,
        //         path: changelogPath,
        //     });

        //     const changelog = await parseChangelog({text: changelogString})

        //     const highestVersionEntry = changelog.versions[0];

        //     const title = highestVersionEntry.title;

        //     if (!title.endsWith('Unreleased')) {
        //         console.log('Skip Changelog: No unreleased version.');
        //         // todo: core info

        //         return;
        //     }

        //     const date = format(new Date(), "dd.MM.yyyy")
        //     const changelogStringCut = changelogString.replace('Unreleased', date);

        //     const newVersionEntry = `## [${newVersion}] - Unreleased\n\n...\n\n`;

        //     const updatedChangelog = changelogStringCut.replace(/(.+?)(##.+)/s, `$1${newVersionEntry}$2`);

        //     await createCommit({
        //         owner,
        //         repo,
        //         branch,
        //         path: changelogPath,
        //         content: updatedChangelog,
        //     });
        // };

        await updatePackageLock();
        await updatePackageJson();
        await updateChangelog();

        await createPullRequest({
            owner,
            repo,
            title: `Next ${project}`,
            body: `Bump version`,
            branch,
            base: defaultBranch,
        });
    };

    await createMainPr();

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
        exit(error, 1);
    });
