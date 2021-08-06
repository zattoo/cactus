const core = require('@actions/core');
const exec = require('@actions/exec');
const github = require('@actions/github');
const fse = require('fs-extra');
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

const getLastVersion = (version) => {
    return version.slice(0, -1) + (Number(version[version.length - 1]) - 1);
};

const exit = (message, exitCode) => {
    if (exitCode === 1) {
        core.error(message);
    } else {
        core.info(message);
    }

    process.exit(exitCode);
};

const getNewVersions = (changelogBefore, changelogAfter) => {
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
        const bodyAfter = item.body;

        const itemBefore = mapBefore[versionAfter] || {};

        const versionBefore = itemBefore.version;
        const dateBefore = itemBefore.date;
        const bodyBefore = itemBefore.body;

        if (!dateBefore && dateAfter) {
            core.info(`New ${versionAfter} candidate detected, preparing release...`);
            foundSomething = true;
            newVersions.push(item);
        }

        if (
            dateBefore && (
                (bodyBefore !== bodyAfter) ||
                (dateBefore !== dateAfter) ||
                (versionBefore !== versionAfter)
            )
        ) {
            exit(`Version ${versionAfter} was already released, it cannot be modified.`, 1);
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

    const release = async (project, item) => {
        const {version} = item;
        const releaseBranch = `release/${project}/${version.slice(0, -2)}`;
        const releaseUrl = `https://github.com/zattoo/cactus/tree/${releaseBranch}`;
        const patchBranch = `patch/${project}/${version}`;
        const first = Number(version[version.length - 1]) === 0;

        if (first) {
            core.info(`Creating release branch ${releaseBranch}...`);

            try {
                await octokit.rest.git.createRef({
                    owner,
                    repo,
                    ref: `refs/heads/${releaseBranch}`,
                    sha: after,
                });
                core.info(`Branch ${releaseBranch} created.\nSee ${releaseUrl}`);
            } catch {
                core.info(`Release ${releaseBranch} already exist.\nSee ${releaseUrl}`);
            }
        } else {
            await exec.exec(`git fetch`);

            const {data: commit} = await octokit.rest.git.getCommit({
                owner,
                repo,
                commit_sha: after,
            });

            await Promise.all([
                exec.exec(`git config user.name ${commit.author.name}`),
                exec.exec(`git config user.email ${commit.author.email}`),
            ]);

            await exec.exec(`git checkout -b ${releaseBranch} origin/${releaseBranch}`);
            await exec.exec(`git checkout -b ${patchBranch}`);

            try {
                await exec.exec(`git cherry-pick ${after}`);
            } catch (e) { // conflict
                await exec.exec('git cherry-pick --abort');

                const changelogPath = `projects/${project}/CHANGELOG.md`;
                const changelog = await fse.readFile(changelogPath, 'utf-8');
                const lastVersion = getLastVersion(version);
                const split = `## [${lastVersion}]`;
                const [before, after] = changelog.split(split);
                const newEntry = `## ${item.title}\n\n${item.body}\n\n`;

                await fse.writeFile(changelogPath, before + newEntry + split + after,'utf-8');
                await exec.exec(`git add ${changelogPath}`);
                await exec.exec(`git commit -m "Patch ${version}"`);
            }

            await exec.exec(`git push origin ${patchBranch}`);

            const {data: user} = await octokit.rest.search.users({q: `${commit.author.email} in:email`});

            const username = user && user.items[0] && user.items[0].login;

            const {data: pr} = await octokit.rest.pulls.create({
                owner,
                repo,
                title: `🍒 ${version}`,
                body: `Cherry-pick got conflict and can't be merged automatically.\n${username ? '@' + username : commit.author.name}, please copy your changes to this PR manually.`,
                head: patchBranch,
                base: releaseBranch,
                draft: true,
            });

            if (username) {
                await octokit.rest.issues.addAssignees({
                    owner,
                    repo,
                    issue_number: pr.number,
                    assignees: [username]
                });
            }

            await octokit.rest.issues.addLabels({
                owner,
                repo,
                issue_number: pr.number,
                labels: ['patch'],
            })
        }
    };

    const analyzeChangelog = async (item) => {
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

        const newVersions = getNewVersions(changelogBefore, changelogAfter);

        if (!isEmpty(newVersions)) {
            await Promise.all(newVersions.map((version) => release(project, version)));
        }
    };

    await Promise.all(changelogs.map(analyzeChangelog));

    if (!foundSomething) {
        exit('No release candidates were found', 0);
    }
})()
    .catch((error) => {
        exit(error, 1);
    });
