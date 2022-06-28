const cleanMessage = (message) => {
    const json = message.match(/(.*)\:\s({.*?})/);

    if (json && json.length === 3) {
        return `${json[1]} - ${JSON.parse(json[2]).message}`;
    }

    return message;
};

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
