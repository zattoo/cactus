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

const editChangelog = async ({
    rawChangelog,
    newVersion,
}) => {
    const changelog = await parseChangelog({text: rawChangelog})

    const {
        title,
        body,
    } = changelog.versions[0];

    if (!title.endsWith('Unreleased')) {
        core.info('Skip Changelog: No unreleased version.');

        return null;
    }

    const date = format(new Date(), "dd.MM.yyyy")

    const changelogDateCut = rawChangelog.replace('Unreleased', date);

    if (!newVersion) {
        return {
            changelog: changelogDateCut,
            versionBody: body,
        };
    }

    const newVersionEntry = `## [${newVersion}] - Unreleased\n\n...\n\n`;
    const changelogNext = changelogDateCut.replace(/(.+?)(##.+)/s, `$1${newVersionEntry}$2`);

    return {
        changelog: changelogNext,
        versionBody: body,
    };
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
    labels,
}) => {
    const branch = `next/${project}`;

    await createBranch({
        owner,
        repo,
        branch,
        sha: baseSha,
    });

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

    const updateChangelog = async () => {
        const {
            changelog,
        } = await editChangelog({
            rawChangelog: files.changelog,
            newVersion,
        });

        await createCommit({
            owner,
            repo,
            branch,
            path: paths.changelog,
            content: changelog,
        });
    };

    // sequencial: commit hashes need to be in order
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
        labels,
    });
};

const createReleaseCandidatePullRequest = async ({
    owner,
    repo,
    baseSha,
    project,
    files,
    paths,
    labels,
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

    let changelogEntries = '';

    const updateChangelog = async () => {
        const {
            changelog,
            body,
        } = await editChangelog({
            rawChangelog: files.changelog,
        });

        changelogEntries = body;

        await createCommit({
            owner,
            repo,
            branch: rcBranch,
            path: paths.changelog,
            content: changelog,
        });
    };

    await updateChangelog();

    const pullRequestBody = `## Changelog\n\n${changelogEntries}\n\n`;

    await createCommit({
        owner,
        repo,
        branch: rcBranch,
        path: `projects/${project}/.release-servcie`,
        content: randomBytes(20).toString('hex') + '\n',
    });

    createPullRequest({
        owner,
        repo,
        title: `Release ${releaseVersion}-${project}`,
        body: pullRequestBody,
        branch: rcBranch,
        base: releaseBranch,
        labels,
    });
};

(async () => {
    const token = core.getInput('token', {required: true});
    const rcLabels = core.getMultilineInput('rc-labels', {required: false});
    const versionRaiseLabels = core.getMultilineInput('main-labels', {required: false});
    const project = core.getInput('project', {required: true});
    const newVersion = core.getInput('new-version', {required: true});

    init(token);

    const payload = getPayload();

    const {
        after,
        repository,
    } = payload;

    const repo = repository.name;
    const owner = repository.full_name.split('/')[0];

    const defaultBranch = repository.default_branch;

    console.log({
        payload,
        after,
        repository,
        owner,
        defaultBranch,
        rcLabels,
        versionRaiseLabels,
        project,
        newVersion,
    });

    // const paths = {
    //     packageJson: `projects/${project}/package.json`,
    //     changelog: `projects/${project}/CHANGELOG.md`,
    //     packageLock: 'package-lock.json',
    // }

    // const files = Object.fromEntries(await Promise.all(
    //     Object.entries(paths).map(async ([key, path]) => {
    //         return [
    //             key,
    //             await getRawFile({
    //                 owner,
    //                 repo,
    //                 path,
    //             })
    //         ];
    //     }),
    // ));

    // await createVersionRaisePullRequest({
    //     owner,
    //     repo,
    //     baseSha: after,
    //     project,
    //     newVersion,
    //     mergeIntoBranch: defaultBranch,
    //     files,
    //     paths,
    //     labels: versionRaiseLabels,
    // });

    // await createReleaseCandidatePullRequest({
    //     owner,
    //     repo,
    //     baseSha: after,
    //     project,
    //     files,
    //     paths,
    //     labels: rcLabels,
    // });
})()
    .catch((error) => {
        console.log(error);
        exit(error, 1);
    });
