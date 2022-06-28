/**
 * We need to manually create the commit because of file size limits of the octokit api,
 * wich we hit with package-lock.json
 *
 * @see https://docs.github.com/en/rest/repos/contents#size-limits
 * @see https://git-scm.com/book/en/v2/Git-Internals-Git-Objects
 */
import * as core from '@actions/core';
import * as github from '@actions/github';

import {GithubError} from './error';

/**
 * Marks a git blob as a file
 */
const BLOB_MODE_FILE = '100644';

let octokit;

export const init = (token) => {
    octokit = github.getOctokit(token);
};

export const getPayload = () => {
    return github.context.payload;
};

export const createBranch = async (data) => {
    const {
        owner,
        repo,
        branch,
        sha,
    } = data;

    try {
        await octokit.rest.git.createRef({
            owner,
            repo,
            sha,
            ref: `refs/heads/${branch}`,
        });

        return;
    } catch (error) {
        // core.info(JSON.stringify(error, Object.getOwnPropertyNames(error)));
        const branchAlreadyExists = error.message === 'Reference already exists';

        core.info(branchAlreadyExists ? 'it already exists' : 'it does not exist');

        core.info(`${branch} creation failed, try update existing`);
    }

    try {
        octokit.rest.git.updateRef({
            force: true,
            owner,
            ref: `heads/${branch}`,
            repo,
            sha,
        })
    } catch (error) {
        throw new GithubError(`${branch} update failed`, error);
    }
};

export const getRawFile = async (data) => {
    try {
        const {data: file} = await octokit.rest.repos.getContent({
            ...data,
            mediaType: {
                format: 'raw'
            },
        });

        return file;
    } catch (error) {
        throw new GithubError(`Failed to get file ${data.path}`, error);
    }
};

export const getLatestCommit = async (data) => {
    try {
        const {data: {commit: latestCommit}} = await octokit.rest.repos.getBranch(data);

        return latestCommit;
    } catch (error) {
        throw new GithubError(`Failed to get latest commit from ${data.branch}`, error);
    }
};

export const createCommit = async ({
    owner,
    repo,
    branch,
    paths,
    files,
}) => {
    const latestCommit = await getLatestCommit({
        owner,
        repo,
        branch,
    });

    const blobs = Object.keys(files).map((fileName) => {
        return {
            content: files[fileName],
            mode: BLOB_MODE_FILE,
            path: paths[fileName],
            type: 'blob',
        };
    });

    try {
        const {data: tree} = await octokit.rest.git.createTree({
            owner,
            repo,
            base_tree: latestCommit.sha,
            tree: blobs,
        });

        const {data: createdCommit} = (await octokit.rest.git.createCommit({
            owner,
            repo,
            branch,
            message: `Update ${Object.values(paths).join(', ')}`,
            tree: tree.sha,
            parents: [latestCommit.sha],
        }));

        await octokit.rest.git.updateRef({
            owner,
            repo,
            ref: `heads/${branch}`,
            sha: createdCommit.sha,
        });
    } catch (error) {
        throw new GithubError(`Failed to create commit on ${branch}`, error);
    }
};

export const createPullRequest = async ({
    owner,
    repo,
    title,
    body,
    branch,
    base,
    labels,
}) => {
    try {
        const {data: pr} = await octokit.rest.pulls.create({
            owner,
            repo,
            title,
            body,
            head: branch,
            base,
        });

        if (labels) {
            await octokit.rest.issues.addLabels({
                owner,
                repo,
                issue_number: pr.number,
                labels,
            });
        }
    } catch (error) {
        throw new GithubError(`Failed to create pull request from ${branch}`, error);
    }
};
