import * as github from '@actions/github';

const BLOB_MODE_FILE = '100644';

let octokit = null;

export const init = (token) => {
    octokit = github.getOctokit(token);
};

export const getPayload = () => {
    const {context} = github;
    const {payload} = context;

    return payload;
};

export const createBranch = async ({
    owner,
    repo,
    ref,
    sha,
}) => {
    await octokit.rest.git.createRef({
        owner,
        repo,
        ref,
        sha,
    });
};

export const getRawFile = async ({
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

export const updateFile = async ({
    owner,
    repo,
    branch,
    path,
    content,
}) => {
    const latestCommit = (await octokit.rest.repos.getBranch({
        owner,
        repo,
        branch,
    })).data.commit;

    const tree = await octokit.rest.git.createTree({
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

    const createdCommit = (await octokit.rest.git.createCommit({
        owner,
        repo,
        branch,
        message: `Update ${path}`,
        tree: tree.data.sha,
        parents: [latestCommit.sha],
    }));

    await octokit.rest.git.updateRef({
        owner,
        repo,
        ref: `heads/${branch}`,
        sha: createdCommit.data.sha,
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
