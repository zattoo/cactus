// import * as core from '@actions/core';

export class GithubError extends Error {
    constructor(message, error) {
        super(`${message}: ${error.message}`, {
            cause: error,
        });
        this.name = 'GithubError';
    }
}

export const isGithubError = (error) => {
    return error instanceof GithubError;
}
