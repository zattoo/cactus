import {execSync} from 'node:child_process';

/**
 * @type {boolean}
 */
let initialized = false;

/**
 *
 * @param {string} command
 * @returns {string}
 */
const execSyncToString = (command) =>{
    console.log(`>> ${command}`);

    try {
        const result = execSync(command);
        return result.toString().replace(/(\r\n|\n|\r| )/gm, '');
    } catch (e) {
        console.log(e);
    }
};

export const setUser = () => {
    execSync('git config user.name "GitHub Actions Bot"');
    execSync('git config user.email "<>"');
    execSync('git fetch --all --progress --depth=3000');

    initialized = true;
};

/**
 * @param {string} project
 * @param {string} defaultBranch
 * @returns {string}
 */
export const getBaseCommit = (project, defaultBranch) => {
    if (!initialized) {
        setUser();
    }

    const previousReleaseBranch = execSyncToString(`git branch -r --list '**/release/${project}/**' | tail -1`);

    // return initial commit on main branch as fallback
    if (!previousReleaseBranch) {
        return execSyncToString(`git rev-list --max-parents=0 origin/${defaultBranch} -1`);
    }

    return execSyncToString(`git merge-base origin/${defaultBranch} ${previousReleaseBranch}`);
};


