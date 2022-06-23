/**
 * We need to manually create the commit because of file size limits of the octokit api,
 * wich we hit with package-lock.json
 *
 * @see https://docs.github.com/en/rest/repos/contents#size-limits
 * @see https://git-scm.com/book/en/v2/Git-Internals-Git-Objects
 */
import * as github from '@actions/github';

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
        await octokit.rest.git.getRef({
            owner,
            repo,
            ref: `heads/${branch}`,
        });

        await octokit.rest.git.deleteRef({
            owner,
            repo,
            ref: `heads/${branch}`,
        });
    } catch {}

    await octokit.rest.git.createRef({
        owner,
        repo,
        sha,
        ref: `refs/heads/${branch}`,
    });
};

export const getRawFile = async (data) => {
    const {data: file} = await octokit.rest.repos.getContent({
        ...data,
        mediaType: {
            format: 'raw'
        },
    });

    return file;
};

export const getLatestCommit = async (data) => {
    const {data: {commit: latestCommit}} = (await octokit.rest.repos.getBranch(data));

    return latestCommit;
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
};
