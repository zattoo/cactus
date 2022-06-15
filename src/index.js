import * as core from '@actions/core';
import parseChangelog from 'changelog-parser';
import {format} from 'date-fns';
import {randomBytes} from 'node:crypto';

import * as github from './github-api';

const exit = (message, exitCode) => {
    if (exitCode === 1) {
        core.error(message);
    } else {
        core.info(message);
    }

    process.exit(exitCode);
};

export const validateVersion = (previousVersion, nextVersion) => {
    if (previousVersion === nextVersion) {
        exit('Version must be different', 1);
    }

    const parsedPreviousVersion = previousVersion.split('.');
    const parsedNextVersion = nextVersion.split('.');

    if (parsedNextVersion.length !== 3) {
        exit('Invalid version format', 1);
    }

    if (Number(parsedNextVersion[2]) !== 0) {
        exit('Cannot cut patch', 1);
    }

    const previousVersionJoined = Number(parsedPreviousVersion.join(''));
    const nextVersionJoined = Number(parsedNextVersion.join(''));

    if (previousVersionJoined >= nextVersionJoined) {
        exit('Version must be greater than previous', 1);
    }
};

const editChangelog = async ({
    rawChangelog,
    nextVersion,
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

    if (!nextVersion) {
        return {
            changelog: changelogDateCut,
            versionBody: body,
        };
    }

    const nextVersionEntry = `## [${nextVersion}] - Unreleased\n\n...\n\n`;
    const changelogNext = changelogDateCut.replace(/(.+?)(##.+)/s, `$1${nextVersionEntry}$2`);

    return {
        changelog: changelogNext,
        versionBody: body,
    };
};

const editPackageJson = ({
    rawPackageJson,
    nextVersion,
}) => {
    const packageJson = JSON.parse(rawPackageJson);

    packageJson.version = nextVersion;

    return JSON.stringify(packageJson, null, 4).concat('\n');
};

const editPackageLock = ({
    rawPackageLock,
    nextVersion,
    project,
}) => {
    const packageLock = JSON.parse(rawPackageLock);

    packageLock.packages[`projects/${project}`].version = nextVersion;

    return JSON.stringify(packageLock, null, 4).concat('\n');
};

const createVersionRaisePullRequest = async ({
    owner,
    repo,
    baseSha,
    project,
    nextVersion,
    mergeIntoBranch,
    files,
    paths,
}) => {
    const branch = `next/${project}`;

    await github.createBranch({
        owner,
        repo,
        branch,
        sha: baseSha,
    });

    const updatedFiles = {
        packageJson: editPackageJson({
            nextVersion,
            rawPackageJson: files.packageJson,
        }),
        packageLock: editPackageLock({
            nextVersion,
            project,
            rawPackageLock: files.packageLock,
        }),
        changelog: (await editChangelog({
            rawChangelog: files.changelog,
            nextVersion,
        })).changelog,
    }

    await github.createCommit({
        owner,
        repo,
        branch,
        paths,
        files: updatedFiles,
    });

    await github.createPullRequest({
        owner,
        repo,
        title: `Next ${project}`,
        body: 'Bump version',
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
    labels,
}) => {
    const packageJson = JSON.parse(files.packageJson);
    const releaseVersion = packageJson.version;

    const release = releaseVersion.slice(0, -2);

    const rcBranch = `rc/${project}/${releaseVersion}`;
    const releaseBranch = `release/${project}/${release}`;

    await Promise.all([
        github.createBranch({
            owner,
            repo,
            branch: releaseBranch,
            sha: baseSha,
        }),
        github.createBranch({
            owner,
            repo,
            branch: rcBranch,
            sha: baseSha,
        }),
    ]);

    const {
        changelog,
        versionBody,
    } = await editChangelog({
        rawChangelog: files.changelog,
    });

    await github.createCommit({
        owner,
        repo,
        branch: rcBranch,
        paths: {
            changelog: paths.changelog,
            serviceFile: `projects/${project}/.release-service`,
        },
        files: {
            changelog,
            serviceFile: randomBytes(20).toString('hex') + '\n',
        },
    });

    await github.createPullRequest({
        owner,
        repo,
        title: `Release ${releaseVersion}-${project}`,
        body: `## Changelog\n\n${versionBody}\n\n`,
        branch: rcBranch,
        base: releaseBranch,
        labels,
    });
};

(async () => {
    const token = core.getInput('token', {required: true});
    const rcLabels = core.getMultilineInput('labels', {required: false});
    const project = core.getInput('project', {required: true});
    const nextVersion = core.getInput('next_version', {required: true});

    github.init(token);

    const payload = github.getPayload();

    const repository = payload.repository;
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
                await github.getRawFile({
                    owner,
                    repo,
                    path,
                })
            ];
        }),
    ));

    const packageJson = JSON.parse(files.packageJson);
    const previousVersion = packageJson.version;

    validateVersion(previousVersion, nextVersion);

    const {sha: baseSha} = await github.getLatestCommit({
        owner,
        repo,
        branch: defaultBranch,
    });

    await Promise.all([
        createVersionRaisePullRequest({
            owner,
            repo,
            baseSha,
            project,
            nextVersion,
            mergeIntoBranch: defaultBranch,
            files,
            paths,
        }),
        createReleaseCandidatePullRequest({
            owner,
            repo,
            baseSha,
            project,
            files,
            paths,
            labels: rcLabels,
        }),
    ]);
})()
    .catch((error) => {
        exit(error, 1);
    });
