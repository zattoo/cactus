/**
 * We need to manually create the commit because of file size limits of the octokit api,
 * wich we hit with package.lock.json
 *
 * More explanation:
 * https://git-scm.com/book/en/v2/Git-Internals-Git-Objects
 * https://octokit.github.io/rest.js/v18
 */
import * as github from '@actions/github';

const BLOB_MODE_FILE = '100644';

let octokit = null;

export const init = (token) => {
    octokit = github.getOctokit(token);
};

export const getPayload = () => {
    return github.context.payload;
};

export const createBranch = async ({
    owner,
    repo,
    branch,
    sha,
}) => {
    await octokit.rest.git.createRef({
        owner,
        repo,
        ref: `refs/heads/${branch}`,
        sha,
    });
};

const getRawFile = async ({
    owner,
    repo,
    path,
}) => {
    const {data: file} = await octokit.rest.repos.getContent({
        owner,
        repo,
        path,
        mediaType: {
            format: 'raw'
        },
    });

    return file;
};

const createCommit = async ({
    owner,
    repo,
    branch,
    path,
    content,
}) => {
    const {data: {commit: latestCommit}} = (await octokit.rest.repos.getBranch({
        owner,
        repo,
        branch,
    }));

    const {data: tree} = await octokit.rest.git.createTree({
        owner,
        repo,
        base_tree: latestCommit.sha,
        tree: [
            {
                path,
                mode: BLOB_MODE_FILE,
                content,
                type: 'blob',
            },
        ],
    });

    const {data: createdCommit} = (await octokit.rest.git.createCommit({
        owner,
        repo,
        branch,
        message: `Update ${path}`,
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

export const updateFile = async ({
    owner,
    repo,
    branch,
    path,
}, fileModifier) => {
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

export const createPullRequest = async ({
    owner,
    repo,
    title,
    body,
    branch,
    base,
}) => {
    await octokit.rest.pulls.create({
        owner,
        repo,
        title,
        body,
        head: branch,
        base,
        draft: true, // to do
    });
};
