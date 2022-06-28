import * as core from '@actions/core';

export class GithubError extends Error {
    constructor(message, apiError) {

        core.info('test1');

        core.info(JSON.stringify({
            apiError: JSON.stringify(apiError, Object.getOwnPropertyNames(apiError)),
            message: apiError.message,
        }));

        core.info('test2');

        // const {message: apiMessage} = JSON.parse(apiError.message);

        super(`${message}`);
        // super(`${message}: ${apiMessage}`);
        this.name = 'GithubError';
    }
}

export const isGithubError = (error) => {
    return error instanceof GithubError;
}
