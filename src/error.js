export class GithubError extends Error {
    constructor(message, error) {
        if (error && error.message) {
            super(`${message}: ${error.message}`, {
                cause: error,
            });
        } else {
            super(message);
        }
        this.name = 'GithubError';
    }
}
