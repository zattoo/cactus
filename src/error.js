import * as core from '@actions/core';

export class GithubError extends Error {
    constructor(message, apiError) {

        core.info({
            apiError: JSON.stringify(apiError, Object.getOwnPropertyNames(apiError)),
            message: apiError.message,
        });

        // const {message: apiMessage} = JSON.parse(apiError.message);

        super(`${message}: ${apiMessage}`);
        this.name = 'GithubError';
    }
}

export const isGithubError = (error) => {
    return error instanceof GithubError;
}
