const core = require('@actions/core');
const github = require('@actions/github');
const parseChangelog = require('changelog-parser');

let foundSomething = false;

const isEmpty = (value) => {
    return (
        value === undefined ||
        value === null ||
        (typeof value === 'object' && Object.keys(value).length === 0) ||
        (typeof value === 'string' && value.trim().length === 0)
    );
};

const exit = (message, exitCode) => {
    if (exitCode === 1) {
        core.error(message);
    } else {
        core.info(message);
    }

    process.exit(exitCode);
};

const getNewVersions = (project, changelogBefore, changelogAfter) => {
    let newVersions = [];

    const mapBefore = changelogBefore.versions.reduce((result, item) => {
        return {
            ...result,
            [item.version]: item,
        };
    }, {});

    changelogAfter.versions.forEach((item) => {
        const versionAfter = item.version;
        const dateAfter = item.date;
        const itemBefore = mapBefore[versionAfter] || {};
        const dateBefore = itemBefore.date;

        if (!dateBefore && dateAfter) {
            core.info(`New ${versionAfter}-${project} version detected, preparing candidate...`);
            foundSomething = true;
            newVersions.push(item);
        }
    });

    return newVersions;
};

(async () => {
    const token = core.getInput('token', {required: true});
    const octokit = github.getOctokit(token);

    const {context} = github;
    const {payload} = context;

    const {
        after,
        before,
        repository,
    } = payload;

    const repo = repository.name;
    const owner = repository.full_name.split('/')[0];

    const commit = await octokit.rest.repos.getCommit({
        owner,
        repo,
        ref: after,
    });

    const {files} = commit.data;

    if (isEmpty(files)) {
        exit('No changes', 0);
    }

    const changelogs = files.filter((file) => file.filename.includes('CHANGELOG.md'));

    if (isEmpty(changelogs)) {
        exit('No changelog changes', 0);
    }

    const cut = async (project, item) => {
        const {version} = item;
        const release = version.slice(0, -2);
        const first = Number(version[version.length - 1]) === 0;

        if (!first) {
            exit(`This is not a first change to ${release} release`, 0);
        }

        const candidateBranch = `candidate/${project}/${version}`;
        const releaseBranch = `release/${project}/${release}`;

        await Promise.all([
            await octokit.rest.git.createRef({
                owner,
                repo,
                ref: `refs/heads/${releaseBranch}`,
                sha: before,
            }),
            await octokit.rest.git.createRef({
                owner,
                repo,
                ref: `refs/heads/${candidateBranch}`,
                sha: after,
            }),
        ]);

        const [
            {data: pr},
            {data: commit},
        ] = await Promise.all([
            octokit.rest.pulls.create({
                owner,
                repo,
                title: `Release ${release}-${project}`,
                body: item.body,
                head: candidateBranch,
                base: releaseBranch,
            }),
            octokit.rest.git.getCommit({
                owner,
                repo,
                commit_sha: after,
            })
        ]);

        console.log('commit', commit);

        await octokit.rest.issues.addLabels({
            owner,
            repo,
            issue_number: pr.number,
            labels: ['release', 'needs qa'],
        });

        const user = await octokit.rest.search.users({
            q: `${commit.author.email} in:email`,
        });

        // octokit.rest.issues.addAssignees({
        //     owner,
        //     repo,
        //     issue_number: pr.number,
        //     assignees: [commit.user],
        // }),

        console.log('user', user);
    };

    const processChanges = async (item) => {
        const {filename} = item;

        const split = filename.split('/');
        const project = split[split.length - 2];

        core.info(`Analyzing ${project} project...`);

        const [contentBefore, contentAfter] = await Promise.all([
            await octokit.rest.repos.getContent({
                owner,
                repo,
                path: filename,
                ref: before,
            }),
            await octokit.rest.repos.getContent({
                owner,
                repo,
                path: filename,
                ref: after,
            }),
        ]);

        const textBefore = Buffer.from(contentBefore.data.content, 'base64').toString();
        const textAfter = Buffer.from(contentAfter.data.content, 'base64').toString();

        const [changelogBefore, changelogAfter] = await Promise.all([
            await parseChangelog({text: textBefore}),
            await parseChangelog({text: textAfter}),
        ]);

        const newVersions = getNewVersions(project, changelogBefore, changelogAfter);

        if (!isEmpty(newVersions)) {
            await Promise.all(newVersions.map((version) => cut(project, version)));
        }
    };

    await Promise.all(changelogs.map(processChanges));

    if (!foundSomething) {
        exit('No release candidates were found', 0);
    }
})()
    .catch((error) => {
        exit(error, 1);
    });
