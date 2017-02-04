const Auth = require('./config/auth.json');
const CommandsStr = require('./config/commands.json');
const Settings = require('./config/settings.json');
const immutable = require('immutable');

module.exports = () => {

    const module = {};
    let monitoredClients = new immutable.Map({});

    /**
     * Returns settings for a singly guild.
     * @param gId
     * @returns {{enable_anti_spam_filtering: boolean, enable_quiet_mode: boolean,
     * enable_client_commands: boolean, max_repeat_of_message: number,
     * max_urls_in_message: number, max_identical_urls_in_message: number, operators: Array}}
     */
    module.getGuildSettings = (gId) => {
        if (Settings.guilds.hasOwnProperty(gId)) {

            // Guild specific settings provided by the owner.
            const readSettings = Settings.guilds[gId];

            readSettings['enable_anti_spam_filtering'] =
                readSettings['enable_anti_spam_filtering'] !== undefined &&
                readSettings['enable_anti_spam_filtering'].isBoolean
                    ? readSettings['enable_anti_spam_filtering']
                    : true ;

            readSettings['enable_quiet_mode'] =
                readSettings['enable_quiet_mode'] !== undefined &&
                readSettings['enable_quiet_mode'].isBoolean
                    ? readSettings['enable_quiet_mode']
                    : false ;

            readSettings['enable_client_commands'] =
                readSettings['enable_client_commands'] !== undefined &&
                readSettings['enable_client_commands'].isBoolean
                    ? readSettings['enable_client_commands']
                    : false ;

            readSettings['anti_spam_mute_instead_of_ban'] =
                readSettings['anti_spam_mute_instead_of_ban'] !== undefined &&
                readSettings['anti_spam_mute_instead_of_ban'].isBoolean
                    ? readSettings['anti_spam_mute_instead_of_ban']
                    : false ;

            readSettings['anti_spam_allow_unsafe_url_suffixes'] =
                readSettings['anti_spam_allow_unsafe_url_suffixes'] !== undefined &&
                readSettings['anti_spam_allow_unsafe_url_suffixes'].isBoolean
                    ? readSettings['anti_spam_allow_unsafe_url_suffixes']
                    : false ;

            readSettings['anti_spam_max_identical_urls_in_message'] =
                readSettings['anti_spam_max_identical_urls_in_message'] !== undefined &&
                !readSettings['anti_spam_max_identical_urls_in_message'].isNaN
                    ? Math.floor(readSettings['anti_spam_max_identical_urls_in_message'])
                    : 4 ;

            readSettings['anti_spam_max_identical_urls_in_total'] =
                readSettings['anti_spam_max_identical_urls_in_total'] !== undefined &&
                !readSettings['anti_spam_max_identical_urls_in_total'].isNaN
                    ? Math.floor(readSettings['anti_spam_max_identical_urls_in_total'])
                    : 2 ;

            readSettings['anti_spam_max_identical_messages_total'] =
                readSettings['anti_spam_max_identical_messages_total'] !== undefined &&
                !readSettings['anti_spam_max_identical_messages_total'].isNaN
                    ? Math.floor(readSettings['anti_spam_max_identical_messages_total'])
                    : 8 ;

            readSettings['anti_spam_safe_url_suffixes'] =
                readSettings['anti_spam_safe_url_suffixes'] !== undefined &&
                readSettings['anti_spam_safe_url_suffixes'].constructor === Array
                    ? Math.floor(readSettings['anti_spam_safe_url_suffixes'])
                    : 2 ;

            readSettings['anti_spam_warning_count_before_ban'] =
                readSettings['anti_spam_warning_count_before_ban'] !== undefined &&
                !readSettings['anti_spam_warning_count_before_ban'].isNaN
                    ? Math.floor(readSettings['anti_spam_warning_count_before_ban'])
                    : 2 ;

            return readSettings;
        } else {
            // Default settings.
            // This list must include all the available settings!
            return {
                "enable_anti_spam_filtering": true,
                "enable_quiet_mode": false,
                "enable_client_commands": true,
                "anti_spam_mute_instead_of_ban": false,
                "anti_spam_allow_unsafe_url_suffixes": false,
                "anti_spam_max_identical_urls_in_message": 2,
                "anti_spam_max_identical_urls_in_total": 3,
                "anti_spam_max_identical_messages_total": 8,
                "anti_spam_safe_url_suffixes": ["com", "net", "org", "gov", "edu"],
                "anti_spam_warning_count_before_ban": 1
            }
        }
    };

    /**
     * Occurrence counter.
     * @param array
     * @param search
     * @returns {any|number|*|R}
     */
    module.getOccurrences = (array, search) => {
        return array.reduce((n, value) => {
            return n + (value === search);
        }, 0);
    };

    /**
     * A very simplistic spam detector.
     * @param Message
     * @param settingsContainer
     * @returns {boolean}
     */
    module.isSpam = (Message, settingsContainer) => {
        let spam = false;
        // Attempt to recognize spam from a singular message.
        const words = Message.content.split(" ");
        let urlCountInMessage = 0;
        const urls = [];
        words.forEach((word) => {
            if (new RegExp("([a-zA-Z0-9]+://)?([a-zA-Z0-9_]+:[a-zA-Z0-9_]+@)?([a-zA-Z0-9.-]+\\.[A-Za-z]{2,4})(:[0-9]+)?(/.*)?").test(word)) {
                urls.push(word);
                urlCountInMessage++;
                if (module.getOccurrences(urls, word) > settingsContainer['max_identical_urls_in_message']) {
                    spam = true;
                }
            }
        });
        if (urlCountInMessage > settingsContainer['max_urls_in_message']) {
            spam = true;
        }

        // Attempt to recognize spam from message history.
        const authorId = Message.author.id;
        const content = encodeURIComponent(Message.content);
        let messageHistory = monitoredClients.get(authorId);
        if (monitoredClients.has(authorId)) {
            // An existing user.
            const count = module.getOccurrences(messageHistory, content);
            if (count > settingsContainer['max_repeat_of_message']) {
                spam = true;
            }
            messageHistory.push(content);
        } else {
            // A new user to be monitored.
            messageHistory = [content];
        }
        // Empty array now and then to avoid buffer overloads.
        if (messageHistory.length > settingsContainer['max_repeat_of_message'] * 2) {
            messageHistory = [content];
        }
        
        // Update memory.
        monitoredClients = monitoredClients.set(authorId, messageHistory);

        return spam
    };

    /**
     * A simple message handler.
     * Reads whether the bot is mentioned and based on that returns the inputted command for further processing.
     * @param Message
     * @returns {*}
     */
    module.handleMessage = (Message) => {
        if (
            Message !== undefined &&
            Message.isMentioned(Auth.id) &&
            Message.content !== undefined &&
            Message.content.length < 256
        ) {
            let content = Message.content.replace(/\s+/g, ' ').replace(`<@${Auth.id}> `, '').toLowerCase().trim();
            // We'll only allow some very specific characters because of security reasons.
            if (/^[a-zA-Z0-9.,!?\-= ]+$/.test(content)) {
                // The command will not be processed if it cannot be found from the command mapping (commands.json).
                content = content.split(' ', 2);
                if (CommandsStr['command_mapping'].hasOwnProperty(content[0])) {
                    // We'll wrap the command this way because we might want to use multiple different command words
                    // for the same util.
                    return {
                        cmd: CommandsStr['command_mapping'][content[0]],
                        str: content[1]
                    };
                }
            }
            return {
                cmd: CommandsStr['command_mapping']['default'],
                str: undefined
            }
        }
        return {};
    };

    return module;
};