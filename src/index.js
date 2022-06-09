import * as core from '@actions/core';
import parseChangelog from 'changelog-parser';
import {format} from 'date-fns';
import {randomBytes} from 'node:crypto';

import {
    init,
    getPayload,
    getRawFile,
    createBranch,
    createCommit,
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
    files,
    paths,
}) => {
    const branch = `next/${project}`;

    await createBranch({
        owner,
        repo,
        branch,
        sha: baseSha,
    });

    // const packageJsonPath = `projects/${project}/package.json`;
    // const changelogPath = `projects/${project}/CHANGELOG.md`;
    // const packageLockPath = 'package-lock.json';

    const updatePackageJson = async () => {
        const packageJson = JSON.parse(files.packageJson);

        packageJson.version = newVersion;

        await createCommit({
            owner,
            repo,
            branch,
            path: paths.packageJson,
            content:  JSON.stringify(packageJson, null, 4).concat('\n'),
        });
    };
    // const updatePackageJson = async () => updateFile({
    //     owner,
    //     repo,
    //     branch,
    //     path: packageJsonPath,
    // }, (rawFile) => {
    //     const packageJson = JSON.parse(rawFile);

    //     packageJson.version = newVersion;

    //     return JSON.stringify(packageJson, null, 4).concat('\n');
    // });

    const updatePackageLock = async () => {
        const packageLock = JSON.parse(files.packageLock);

        packageLock.packages[`projects/${project}`].version = newVersion;

        await createCommit({
            owner,
            repo,
            branch,
            path: paths.packageLock,
            content: JSON.stringify(packageLock, null, 4).concat('\n'),
        });
    };

    // const updatePackageLock = async () => updateFile({
    //     owner,
    //     repo,
    //     branch,
    //     path: packageLockPath,
    // }, (rawFile) => {
    //     const packageLock = JSON.parse(rawFile);

    //     packageLock.packages[`projects/${project}`].version = newVersion;

    //     return JSON.stringify(packageLock, null, 4).concat('\n');
    // });

    const updateChangelog = async () => {
        const changelog = await parseChangelog({text: files.changelog})

        const highestTitle = changelog.versions[0].title;

        if (!highestTitle.endsWith('Unreleased')) {
            core.info('Skip Changelog: No unreleased version.');

            return null;
        }

        const newVersionEntry = `## [${newVersion}] - Unreleased\n\n...\n\n`;
        const date = format(new Date(), "dd.MM.yyyy")

        const changelogDateCut = files.changelog.replace('Unreleased', date);
        const changelogNext = changelogDateCut.replace(/(.+?)(##.+)/s, `$1${newVersionEntry}$2`);

        await createCommit({
            owner,
            repo,
            branch,
            path: paths.changelog,
            content: changelogNext,
        });
    };
    // const updateChangelog = async () => updateFile({
    //     owner,
    //     repo,
    //     branch,
    //     path: changelogPath,
    // }, async (rawFile) => {
    //     const changelog = await parseChangelog({text: rawFile})

    //     const highestTitle = changelog.versions[0].title;

    //     if (!highestTitle.endsWith('Unreleased')) {
    //         core.info('Skip Changelog: No unreleased version.');

    //         return null;
    //     }

    //     const newVersionEntry = `## [${newVersion}] - Unreleased\n\n...\n\n`;
    //     const date = format(new Date(), "dd.MM.yyyy")

    //     const changelogDateCut = rawFile.replace('Unreleased', date);
    //     const changelogNext = changelogDateCut.replace(/(.+?)(##.+)/s, `$1${newVersionEntry}$2`);

    //     return changelogNext;
    // });

    // sequencial: commit hashes need to be in order
    await updatePackageLock();
    await updatePackageJson();
    await updateChangelog();

    // to do: add labels
    await createPullRequest({
        owner,
        repo,
        title: `Next ${project}`,
        body: `Bump version`,
        branch,
        base: mergeIntoBranch,
    });
};

const createReleaseCandidatePullRequest = async ({
    owner,
    repo,
    baseSha,
    project,
    files,
    paths,
}) => {
    const packageJson = JSON.parse(files.packageJson);
    const releaseVersion = packageJson.version;

    const release = releaseVersion.slice(0, -2);

    const rcBranch = `rc/${project}/${releaseVersion}`;
    const releaseBranch = `release/${project}/${release}`;

    await Promise.all([
        await createBranch({
            owner,
            repo,
            branch: releaseBranch,
            sha: baseSha,
        }),
        await createBranch({
            owner,
            repo,
            branch: rcBranch,
            sha: baseSha,
        }),
    ]);

    // const changelogPath = `projects/${project}/CHANGELOG.md`;

    let changelogEntries = '';

    const updateChangelog = async () => {
        const changelog = await parseChangelog({text: files.changelog})

        const {
            title,
            body,
        } = changelog.versions[0].title;

        if (!title.endsWith('Unreleased')) {
            core.info('Skip Changelog: No unreleased version.');

            return null;
        }

        changelogEntries = body;

        const date = format(new Date(), "dd.MM.yyyy")

        const changelogDateCut = rawFile.replace('Unreleased', date);

        await createCommit({
            owner,
            repo,
            branch: rcBranch,
            path: paths.changelog,
            content: changelogDateCut,
        });
    };

    // const updateChangelog = async () => updateFile({
    //     owner,
    //     repo,
    //     branch: rcBranch,
    //     path: paths.changelog,
    // }, async (rawFile) => {
    //     const changelog = await parseChangelog({text: rawFile})

    //     const {
    //         title,
    //         body,
    //     } = changelog.versions[0];

    //     if (!title.endsWith('Unreleased')) {
    //         core.info('Skip Changelog: No unreleased version.');

    //         return null;
    //     }

    //     changelogEntries = body;

    //     const date = format(new Date(), "dd.MM.yyyy")

    //     const changelogDateCut = rawFile.replace('Unreleased', date);

    //     return changelogDateCut;
    // });

    await updateChangelog();

    const pullRequestBody = `## Changelog\n\n${changelogEntries}\n\n`;

    await createCommit({
        owner,
        repo,
        branch: rcBranch,
        path: `projects/${project}/.release-servcie`,
        content: randomBytes(20).toString('hex'),
    });

    createPullRequest({
        owner,
        repo,
        title: `Release ${releaseVersion}-${project}`,
        body: pullRequestBody,
        branch: rcBranch,
        base: releaseBranch,
    });

    // ToDo
    // await octokit.rest.issues.addLabels({
    //     owner,
    //     repo,
    //     issue_number: pr.number,
    //     labels,
    // });
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
        repository,
    } = payload;
    // const packageJsonPath = `projects/${project}/package.json`;
    // const changelogPath = `projects/${project}/CHANGELOG.md`;
    // const packageLockPath = 'package-lock.json';

    const repo = repository.name;
    const owner = repository.full_name.split('/')[0];

    const defaultBranch = repository.default_branch;

    const paths = {
        packageJson: `projects/${project}/package.json`,
        changelog: `projects/${project}/CHANGELOG.md`,
        packageLock: 'package-lock.json',
    }

    const files = Object.fromEntries(await Promise.all(
        Object.entries(paths).map(async ([key, path]) => {
            return [
                key,
                await getRawFile({
                    owner,
                    repo,
                    path,
                })
            ];
        }),
    ));

    // const files = paths.map(async (path) => {
    //     return await getRawFile({
    //             owner,
    //             repo,
    //             path,
    //         });
    // });

    // const packageJsonPath = `projects/${project}/package.json`;
    // const packageJsonString = await getRawFile({
    //     owner,
    //     repo,
    //     path: packageJsonPath,
    // });

    await createVersionRaisePullRequest({
        owner,
        repo,
        baseSha: after,
        project,
        newVersion,
        mergeIntoBranch: defaultBranch,
        files,
        paths,
    });

    await createReleaseCandidatePullRequest({
        owner,
        repo,
        baseSha: after,
        project,
        files,
        paths,
    });
})()
    .catch((error) => {
        console.log(error);
        exit(error, 1);
    });
