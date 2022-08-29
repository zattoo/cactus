import * as core from '@actions/core';
import parseChangelog from 'changelog-parser';
import {format} from 'date-fns';
import {randomBytes} from 'node:crypto';

import * as github from './github-api';
import * as gitService from './git';

const exit = (error) => {
    core.debug(JSON.stringify(error, Object.getOwnPropertyNames(error)));

    core.error(error);

    process.exit(1);
};

const validateVersion = (releaseVersion, nextVersion) => {
    if (releaseVersion === nextVersion) {
        throw new Error('Version must be different');
    }

    const parsedReleaseVersion = releaseVersion.split('.');

    if (parsedReleaseVersion.length !== 3) {
        throw new Error(`Invalid version format ${releaseVersion}`);
    }

    if (!nextVersion) {
        return;
    }

    const parsedNextVersion = nextVersion.split('.');

    const releaseVersionJoined = Number(parsedReleaseVersion.join(''));
    const nextVersionJoined = Number(parsedNextVersion.join(''));

    if (parsedNextVersion.length !== 3) {
        throw new Error(`Invalid version format ${nextVersion}`);
    }

    if (Number(parsedNextVersion[2]) !== 0) {
        throw new Error('Cannot cut patch');
    }

    if (releaseVersionJoined >= nextVersionJoined) {
        throw new Error('Version must be greater than previous');
    }
};

const editChangelog = async ({
    rawChangelog,
    nextVersion,
    releaseVersion,
    prepareNextEntry,
}) => {
    const changelog = await parseChangelog({text: rawChangelog})

    const {
        title,
        body,
    } = changelog.versions[0];

    if (!title.endsWith('Unreleased')) {
        core.info('Skip Changelog: No unreleased version.');

        return {
            changelog: rawChangelog,
            versionBody: body,
        };
    }

    const date = format(new Date(), "dd.MM.yyyy")

    const changelogDateCut = rawChangelog.replace(/##(\s\[.+\]\s\-)?(\sUnreleased)/, `## [${releaseVersion}] - ${date}`);

    if (!prepareNextEntry) {
        return {
            changelog: changelogDateCut,
            versionBody: body,
        };
    }

    const nextVersionEntry = nextVersion
        ? `## [${nextVersion}] - Unreleased\n\n...\n\n`
        : `## Unreleased\n\n...\n\n`;

    const changelogNext = changelogDateCut.replace(/(.+?)(##.+)/s, `$1${nextVersionEntry}$2`);

    return {
        changelog: changelogNext,
        versionBody: body,
    };
};

const editPackageJson = ({
    rawPackageJson,
    version,
}) => {
    const packageJson = JSON.parse(rawPackageJson);

    packageJson.version = version;

    return JSON.stringify(packageJson, null, 4).concat('\n');
};

const editPackageLock = ({
    rawPackageLock,
    version,
    project,
    projectPath,
}) => {
    const packageLock = JSON.parse(rawPackageLock);

    packageLock.packages[`${projectPath}/${project}`].version = version;

    return JSON.stringify(packageLock, null, 4).concat('\n');
};

const createVersionRaisePullRequest = async ({
    owner,
    repo,
    baseSha,
    project,
    nextVersion,
    releaseVersion,
    mergeIntoBranch,
    files,
    paths,
    projectPath,
}) => {
    const branch = `next/${project}`;
    const version = nextVersion || releaseVersion;

    const hasNextBranch = await github.hasBranch({
        owner,
        repo,
        branch,
    });

    if (hasNextBranch) {
        throw new Error(`${branch} already exists. You are probably trying to cut a version that was already cut`);
    }

    await github.createBranch({
        owner,
        repo,
        branch,
        sha: baseSha,
    });

    const updatedFiles = {
        packageJson: editPackageJson({
            rawPackageJson: files.packageJson,
            version,
        }),
        packageLock: editPackageLock({
            rawPackageLock: files.packageLock,
            project,
            projectPath,
            version,
        }),
        changelog: (await editChangelog({
            prepareNextEntry: true,
            rawChangelog: files.changelog,
            nextVersion,
            releaseVersion,
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
    releaseVersion,
    files,
    paths,
    labels,
    projectPath,
    defaultBranch,
}) => {
    const release = releaseVersion.slice(0, -2);

    const rcBranch = `rc/${project}/${releaseVersion}`;
    const rcTempBranch = `temp/rc_${project}_${releaseVersion}`;
    const releaseBranch = `release/${project}/${release}`;

    const [
        hasRcBranch,
        hasReleaseBranch
    ] = await Promise.all([
        github.hasBranch({
            owner,
            repo,
            branch: rcBranch,
        }),
        github.hasBranch({
            owner,
            repo,
            branch: releaseBranch,
        }),
    ]);

    if (hasRcBranch || hasReleaseBranch) {
        throw new Error(`${rcBranch} and ${releaseBranch} already exist. You are probably trying to cut a version that was already cut`);
    }

    await Promise.all([
        github.createBranch({
            owner,
            repo,
            branch: releaseBranch,
            sha: gitService.getBaseCommit(project, defaultBranch),
        }),
        github.createBranch({
            owner,
            repo,
            branch: rcTempBranch,
            sha: baseSha,
        }),
    ]);

    const {
        changelog,
        versionBody,
    } = await editChangelog({
        rawChangelog: files.changelog,
        releaseVersion,
    });

    const updatedFiles = {
        packageJson: editPackageJson({
            version: releaseVersion,
            rawPackageJson: files.packageJson,
        }),
        packageLock: editPackageLock({
            version: releaseVersion,
            project,
            rawPackageLock: files.packageLock,
            projectPath,
        }),
        serviceFile: randomBytes(20).toString('hex') + '\n',
        changelog,
    }

    const {sha: rcTempSha} = await github.createCommit({
        owner,
        repo,
        branch: rcTempBranch,
        paths: {
            ...paths,
            serviceFile: `${projectPath}/${project}/.release-service`,
        },
        files: updatedFiles,
    });

    await github.createBranch({
        owner,
        repo,
        branch: rcBranch,
        sha: rcTempSha,
    });

    await github.deleteBranch({
        owner,
        repo,
        branch: rcTempBranch,
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
    const releaseVersionInput = core.getInput('release_version', {required: false});
    const nextVersion = core.getInput('next_version', {required: false});
    const projectPath = core.getInput('project_path', {required: false});

    github.init(token);

    const payload = github.getPayload();

    const repository = payload.repository;
    const repo = repository.name;
    const owner = repository.full_name.split('/')[0];

    const defaultBranch = repository.default_branch;

    const paths = {
        packageJson: `${projectPath}/${project}/package.json`,
        changelog: `${projectPath}/${project}/CHANGELOG.md`,
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
    const releaseVersion = releaseVersionInput || packageJson.version;

    validateVersion(releaseVersion, nextVersion);

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
            releaseVersion,
            mergeIntoBranch: defaultBranch,
            files,
            paths,
            projectPath,
        }),
        createReleaseCandidatePullRequest({
            owner,
            repo,
            baseSha,
            project,
            releaseVersion,
            files,
            paths,
            labels: rcLabels,
            projectPath,
            defaultBranch,
        }),
    ]);
})()
    .catch((error) => {
        exit(error);
    });
