const cleanMessage = (message) => {
    // api error responses sometimes contain information as json with a string prefix
    const json = message.match(/(.*)\:\s({.*?})/);

    if (json && json.length === 3) {
        return `${json[1]} - ${JSON.parse(json[2]).message}`;
    }

    return message;
};

export class GithubError extends Error {
    constructor(message, error) {
        super(`${message}: ${cleanMessage(error.message)}`, {
            cause: error,
        });

        this.name = 'GithubError';
    }
}
