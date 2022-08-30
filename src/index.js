import * as core from '@actions/core';

import * as github from './github-api';
import * as gitService from './git';

const exit = (error) => {
    core.debug(JSON.stringify(error, Object.getOwnPropertyNames(error)));

    core.error(error);

    process.exit(1);
};

const validateVersion = (releaseVersion) => {
    const parsedReleaseVersion = releaseVersion.split('.');

    if (parsedReleaseVersion.length !== 3) {
        throw new Error(`Invalid version format ${releaseVersion}`);
    }
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
    }

    const {sha: rcTempSha} = await github.createCommit({
        owner,
        repo,
        branch: rcTempBranch,
        paths,
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
        body: `## TBD`,
        branch: rcBranch,
        base: releaseBranch,
        labels,
    });
};

(async () => {
    const token = core.getInput('token', {required: true});
    const rcLabels = core.getMultilineInput('labels', {required: false});
    const project = core.getInput('project', {required: true});
    const releaseVersion = core.getInput('release_version', {required: true});
    const projectPath = core.getInput('project_path', {required: false});

    github.init(token);

    const payload = github.getPayload();

    const repository = payload.repository;
    const repo = repository.name;
    const owner = repository.full_name.split('/')[0];

    const defaultBranch = repository.default_branch;

    const paths = {
        packageJson: `${projectPath}/${project}/package.json`,
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

    validateVersion(releaseVersion);

    const {sha: baseSha} = await github.getLatestCommit({
        owner,
        repo,
        branch: defaultBranch,
    });

    await createReleaseCandidatePullRequest({
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
    });
})()
    .catch((error) => {
        exit(error);
    });
