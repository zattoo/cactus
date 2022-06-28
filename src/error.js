export class GithubError extends Error {
    constructor(message, error) {
        super(`${message}: ${error.message}`, {
            cause: error,
        });
        this.name = 'GithubError';
    }
}
