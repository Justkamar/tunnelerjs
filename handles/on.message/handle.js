const {log, print} = require('../../util/module.inc.debug')();
const Parser = require('../../util/module.inc.parser')();

/**
 * Message handle.
 * @param {object} Client
 * @param {object} GuildsMap
 * @param {string} ownerId
 * @return {object}
 */
module.exports = (Client, GuildsMap, ownerId) => {
    const module = {};

    /**
     * Executes middleware for the handle.
     * Is able to block the execution is necessary.
     * @param {object} Message
     * @return {string}
     */
    module.prepare = (Message) => {
        const {guild, channel} = Message;
        const thisGuild = GuildsMap[guild.id];
        if (
            thisGuild &&
            thisGuild.middlewares
        ) {
            Object.keys(thisGuild.middlewares).forEach((mwKey) => {
                const {
                    execute,
                    enabledChannels,
                    excludedChannels,
                } = thisGuild.middlewares[mwKey];
                // Make sure this channel is included to be middlewared
                // and then execute. If the execution returns true,
                // the command process may go on.
                if (
                    Parser.isIncluded(
                        channel.name,
                        enabledChannels,
                        excludedChannels,
                        true
                    )
                ) {
                    const haltReason = execute(Message);
                    if (typeof haltReason !== 'string' || haltReason.length) {
                        // An invalid return or an error message encountered.
                        return typeof haltReason === 'string'
                        ? haltReason
                        : `Middleware ${mwKey} halted the processing.`;
                    }
                };
            });
        }
        // No middlewares specified or the execution was ok.
        return '';
    };

    const hasAccess = (accesses, authorId) => {
        try {
            // No access.
            if (
                typeof accesses !== 'object' ||
                accesses.constructor !== Array ||
                !accesses.length
            ) return false;
            // All access.
            if (accesses.indexOf('all') !== -1) return true;
            // Owner access.
            if (
                accesses.indexOf('owner') !== -1 &&
                authorId === ownerId
            ) return true;
            // Author id access.
            if (accesses.indexOf(authorId) !== -1) return true;
        } catch (e) {
            print('Verifying access failed.', 'MAIN', true, e);
        }
        return false;
    };

    /**
     * Executes the handle.
     * @param {object} Message
     * @return {boolean}
     */
    module.handle = (Message) => {
        const {content, guild, channel, author} = Message;
        const {user} = Client;
        // Listen for direct commands only.
        const thisGuild = GuildsMap[guild.id];
        if (
            !thisGuild ||
            !Message.isMentioned(user) ||
            !Parser.isSafe(content)
        ) return false;
        const {commands} = thisGuild;
        const cmdKey = Parser.firstMatch(
            Object.keys(commands),
            Parser.trim(content)
        );
        // The command must exist.
        if (commands[cmdKey] === undefined) return false;
        // Look for user access.
        const {
            execute,
            access,
            enabledChannels,
            excludedChannels,
        } = commands[cmdKey];
        if (Parser.isIncluded(
            channel.name, enabledChannels, excludedChannels, true) &&
            hasAccess(access, author.id)
        ) {
            // Measure execution time for the command.
            const perfMeasure = process.hrtime();
            const response = execute(Message, Client);
            log(
                `A triggered command (${cmdKey}) took `
                + `${process.hrtime(perfMeasure)[0]}s (`
                + `${process.hrtime(perfMeasure)[1]}ms) to execute on `
                + `a channel (${channel.name}).`,
                'MAIN'
            );
            if (typeof response === 'string' && response.length) {
                // The command responded with something to say...
                Message.reply(response);
            }
            return true;
        }
        return false;
    };

    return module;
};
