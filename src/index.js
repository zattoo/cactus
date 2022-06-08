const core = require('@actions/core');
// const exec = require('@actions/exec');
const github = require('@actions/github');
const parseChangelog = require('changelog-parser');

// let foundSomething = false;

// const isEmpty = (value) => {
//     return (
//         value === undefined ||
//         value === null ||
//         (typeof value === 'object' && Object.keys(value).length === 0) ||
//         (typeof value === 'string' && value.trim().length === 0)
//     );
// };

const exit = (message, exitCode) => {
    if (exitCode === 1) {
        core.error(message);
    } else {
        core.info(message);
    }

    process.exit(exitCode);
};

// const getNewVersions = (project, changelogBefore, changelogAfter) => {
//     let newVersions = [];

//     const mapBefore = changelogBefore.versions.reduce((result, item) => {
//         return {
//             ...result,
//             [item.version]: item,
//         };
//     }, {});

//     changelogAfter.versions.forEach((item) => {
//         const versionAfter = item.version;
//         const dateAfter = item.date;
//         const itemBefore = mapBefore[versionAfter] || {};
//         const dateBefore = itemBefore.date;

//         if (!dateBefore && dateAfter) {
//             core.info(`New ${versionAfter}-${project} version detected, preparing candidate...`);
//             foundSomething = true;
//             newVersions.push(item);
//         }
//     });

//     return newVersions;
// };

// const raiseVersion = async () => {

// };

(async () => {
    const token = core.getInput('token', {required: true});
    // const labels = core.getMultilineInput('labels', {required: false});
    const project = core.getInput('project', {required: true});
    const newVersion = core.getInput('new-version', {required: true});
    const octokit = github.getOctokit(token);

    // await raiseVersion();

    const {context} = github;
    const {payload} = context;

    const {
        after,
        before,
        repository,
    } = payload;

    const repo = repository.name;
    const owner = repository.full_name.split('/')[0];

    const defaultBranch = repository.default_branch;

    // console.log({
    //     repo,
    //     payload,
    // });

    const createMainPr = async () => {
        // const path = `projects/${project}/package.json`;
        const branch = `next/${project}`;
        const ref = `refs/heads/${branch}`;

        await octokit.rest.git.createRef({
            owner,
            repo,
            ref,
            sha: after,
        });

        const packageJsonPath = `projects/${project}/package.json`;
        const packageLockPath = 'package-lock.json';

        // Update version in package.json
        const updatePackageJson = async () =>  {
            const {data: file} = await octokit.rest.repos.getContent({
                owner,
                repo,
                path: packageJsonPath,
            });

            const sha = file.sha;

            const decodeJson = Buffer.from(file.content, 'base64');

            const packageJson = JSON.parse(decodeJson);

            packageJson.version = newVersion;

            const packageJsonString = JSON.stringify(packageJson, null, 4).concat('\n');

            await octokit.rest.repos.createOrUpdateFileContents({
                owner,
                repo,
                path: packageJsonPath,
                message: 'Update package.json version',
                content: Buffer.from(packageJsonString).toString('base64'),
                sha,
                branch,
            });
        };

        // Update version in package-lock.json
        const updatePackageLock = async () =>  {
            const {data: packageLockString} = await octokit.rest.repos.getContent({
                owner,
                repo,
                path: packageLockPath,
                mediaType: {
                    format: 'raw'
                },
            });

            const packageLockJson = JSON.parse(packageLockString);

            packageLockJson.packages[`projects/${project}`].version = newVersion;

            const latestCommit = (await octokit.rest.repos.getBranch({
                owner,
                repo,
                branch,
            })).data.commit;

            console.log({latestCommit});

            const tree = await octokit.rest.git.createTree({
                owner,
                repo,
                base_tree: latestCommit.sha,
                tree: [
                    {
                      path: packageLockPath,
                      mode: '100644',
                      content: JSON.stringify(packageLockJson, null, 4).concat('\n'),
                    //   content: rawJson,
                    //   content: 'fully overwrite',
                      type: 'blob',
                    },
                ],
            });

            console.log({tree});

            const createdCommit = (await octokit.rest.git.createCommit({
                owner,
                repo,
                branch,
                message: 'Test Commit with GitHub API',
                tree: tree.data.sha,
                parents: [latestCommit.sha],
            }));

            console.log({createdCommit});

            const updateRef = await octokit.rest.git.updateRef({
                owner,
                repo,
                // branch,
                ref: `heads/${branch}`,
                // ref: `heads/${target.branch}`,
                sha: createdCommit.data.sha,
            });

            console.log({updateRef});

            // // const packageLock = await fse.readJson(packageLockPath, 'utf8');
            // // packageLock.packages[`projects/${project}`].version = version;
            // // await fse.writeFile(packageLockPath, JSON.stringify(packageLock, null, 4).concat('\n'));
            // // const {data: {sha}} = await octokit.rest.repos.getContent({
            // const {data: sha} = await octokit.rest.repos.getContent({
            //     owner,
            //     repo,
            //     path: packageLockPath,
            //     mediaType: {
            //         format: 'sha',
            //     },
            // });

            // // response = await octokit.repos.listCommits({
            // //     owner,
            // //     repo,
            // //     sha: base,
            // //     per_page: 1
            // // })

            // console.log({
            //     sha,
            //     actualSHA: sha.sha,
            //     afterSHA: after,
            // });

            // // const {data: jsonString} = await octokit.rest.repos.getContent({
            // //     owner,
            // //     repo,
            // //     path: packageLockPath,
            // //     mediaType: {
            // //         format: 'raw'
            // //     },
            // // });

            // // console.log({jsonString});

            // // const sha = file.sha;

            // // const decodeJson = Buffer.from(file.content, 'base64');

            // // console.log({
            // //     file,
            // //     filecontent: file.content,
            // //     jsonString: decodeJson.toString(),
            // // });

            // const packageLockJson = JSON.parse(jsonString);

            // // // console.log({
            // // //     packageLockJson,
            // // //     sha,
            // // // })

            // packageLockJson.packages[`projects/${project}`].version = newVersion;

            // const packageLockString = JSON.stringify(packageLockJson, null, 4).concat('\n');

            // console.log({
            //     packageLockString,
            // });

            // const test = await octokit.rest.repos.createOrUpdateFileContents({
            //     owner,
            //     repo,
            //     path: packageJsonPath,
            //     message: 'Update package-lock.json project version',
            //     content: packageLockString,
            //     // content: Buffer.from(packageLockString).toString('base64'),
            //     sha,
            //     branch,
            // });

            // console.log({test});
        };

        await Promise.all([
            // updatePackageJson(),
            updatePackageLock(),
        ]);

        /*
        // creates the pr!
        const {data: pr} = await octokit.rest.pulls.create({
            owner,
            repo,
            title: `Next ${project}`,
            body: `Bump version`,
            head: branch,
            base: defaultBranch,
            draft: true, // to do
        })
        */

        // const update = await updatePackageJson();

        // console.log({
        //     content,
        //     data,
        //     sha,
        // })

        // console.log({update});
    };

    await createMainPr();

    // const commit = await octokit.rest.repos.getCommit({
    //     owner,
    //     repo,
    //     ref: after,
    // });

    // const {files} = commit.data;

    // // console.log({
    // //     labels,
    // //     context,
    // //     payload,
    // //     after,
    // //     before,
    // //     repository,
    // //     repo,
    // //     owner,
    // //     commit,
    // //     data: commit.data,
    // //     files,
    // // });

    // if (isEmpty(files)) {
    //     exit('No changes', 0);
    // }

    // const changelogs = files.filter((file) => file.filename.includes('CHANGELOG.md'));

    // if (isEmpty(changelogs)) {
    //     exit('No changelog changes', 0);
    // }

    // const cut = async (project, item) => {
    //     const {version} = item;
    //     const release = version.slice(0, -2);
    //     const first = Number(version[version.length - 1]) === 0;

    //     // console.log({
    //     //     project,
    //     //     item,
    //     //     version,
    //     //     release,
    //     //     first,
    //     // });

    //     if (!first) {
    //         exit(`This is not a first change to ${release} release`, 0);
    //     }

    //     const rcBranch = `rc/${project}/${version}`;
    //     const releaseBranch = `release/${project}/${release}`;

    //     await Promise.all([
    //         await octokit.rest.git.createRef({
    //             owner,
    //             repo,
    //             ref: `refs/heads/${releaseBranch}`,
    //             sha: before,
    //         }),
    //         await octokit.rest.git.createRef({
    //             owner,
    //             repo,
    //             ref: `refs/heads/${rcBranch}`,
    //             sha: after,
    //         }),
    //     ]);

    //     const body = `## Changelog\n\n${item.body}\n\n`;

    //     const {data: pr} = await octokit.rest.pulls.create({
    //         owner,
    //         repo,
    //         title: `Release ${version}-${project}`,
    //         body,
    //         head: rcBranch,
    //         base: releaseBranch,
    //     })

    //     await octokit.rest.issues.addLabels({
    //         owner,
    //         repo,
    //         issue_number: pr.number,
    //         labels,
    //     });
    // };

    // const processChanges = async (item) => {
    //     const {filename} = item;

    //     const split = filename.split('/');
    //     const project = split[split.length - 2];

    //     core.info(`Analyzing ${project} project...`);

    //     // console.log({
    //     //     item,
    //     //     filename,
    //     //     split,
    //     //     project,
    //     // });

    //     const [contentBefore, contentAfter] = await Promise.all([
    //         await octokit.rest.repos.getContent({
    //             owner,
    //             repo,
    //             path: filename,
    //             ref: before,
    //         }),
    //         await octokit.rest.repos.getContent({
    //             owner,
    //             repo,
    //             path: filename,
    //             ref: after,
    //         }),
    //     ]);

    //     // console.log({
    //     //     contentBefore,
    //     //     contentAfter,
    //     // });

    //     const textBefore = Buffer.from(contentBefore.data.content, 'base64').toString();
    //     const textAfter = Buffer.from(contentAfter.data.content, 'base64').toString();

    //     // console.log({
    //     //     textBefore,
    //     //     textAfter,
    //     // });

    //     const [changelogBefore, changelogAfter] = await Promise.all([
    //         await parseChangelog({text: textBefore}),
    //         await parseChangelog({text: textAfter}),
    //     ]);

    //     // console.log({
    //     //     changelogBefore,
    //     //     changelogAfter,
    //     // });

    //     const newVersions = getNewVersions(project, changelogBefore, changelogAfter);

    //     // console.log({
    //     //     newVersions
    //     // });

    //     if (!isEmpty(newVersions)) {
    //         await Promise.all(newVersions.map((version) => cut(project, version)));
    //     }
    // };

    // await Promise.all(changelogs.map(processChanges));

    // if (!foundSomething) {
    //     exit('No release candidates were found', 0);
    // }
})()
    .catch((error) => {
        exit(error, 1);
    });
