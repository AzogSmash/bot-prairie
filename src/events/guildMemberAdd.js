const { welcome } = require('../modules/welcome');

module.exports = {
  name: 'guildMemberAdd',
  async execute(member) {
    await welcome(member);
  },
};