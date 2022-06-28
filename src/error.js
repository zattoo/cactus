// import * as core from '@actions/core';

export class GithubError extends Error {
    constructor(message, data) {
        super(`${message}: ${data.cause.message}`, data);
        this.name = 'GithubError';
        // this.cause = data.cause;
    }
}

export const isGithubError = (error) => {
    return error instanceof GithubError;
}
