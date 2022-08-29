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

    return execSync(command).toString().replace(/(\r\n|\n|\r| )/gm, '');
}

export const setUser = () => {
    execSync('git config user.name "GitHub Actions Bot"');
    execSync('git config user.email "<>"');

    initialized = true;
};

/**
 * @param {string} project
 * @returns {string}
 */
export const getBaseCommit = (project) => {
    if (!initialized) {
        setUser();
    }

    console.log(project);

    console.log(execSyncToString(`git branch --list 'release/${project}/**' | tail -1`))

    const previousReleaseBranch = execSyncToString(`git branch -r --list 'release/${project}/**' | tail -1`);

    // return initial commit on main branch as fallback
    if (!previousReleaseBranch) {
        return execSyncToString('git rev-list --max-parents=0 HEAD -1');
    }

    return execSyncToString(`git merge-base HEAD ${previousReleaseBranch}`);
};


