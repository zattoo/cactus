import {execSync} from 'node:child_process';

/**
 *
 * @param {string} command
 * @returns {string}
 */
const execSyncToString = (command) =>{
    console.log(`>> ${command}`);

    return execSync(command).toString().replace(/(\r\n|\n|\r| )/gm, '');
};

/**
 * @param {string} project
 * @param {string} defaultBranch
 * @returns {string}
 */
export const getBaseCommit = (project, defaultBranch) => {
    const previousReleaseBranch = execSyncToString(`git branch -r --list '**/release/${project}/**' | tail -1`);

    // return initial commit on main branch as fallback
    if (!previousReleaseBranch) {
        return execSyncToString(`git rev-list --max-parents=0 origin/${defaultBranch} -1`);
    }

    const baseCommit = execSyncToString(`git merge-base origin/${defaultBranch} ${previousReleaseBranch}`);

    console.log(`Base commit for the upcoming release is: ${baseCommit}`);

    return baseCommit;
};


