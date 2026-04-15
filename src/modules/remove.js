// src/events/guildMemberRemove.js
const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'guildMemberRemove',
  async execute(member) {
    const channel = member.guild.channels.cache.get(process.env.WELCOME_CHANNEL_ID);
    if (!channel) return;

    const embed = new EmbedBuilder()
      .setColor('#e74c3c')
      .setAuthor({ 
        name: `${member.user.username} nous a quittés`, 
        iconURL: member.user.displayAvatarURL({ dynamic: true }) 
      })
      .setDescription(`${member.user} a quitté la Prairie 🍂\nOn te souhaite bonne route !`)
      .setFooter({ text: 'Prairie Brawl Stars' })
      .setTimestamp();

    await channel.send({ embeds: [embed] });
  }
};

// src/events/guildMemberRemove.js
const { EmbedBuilder } = require('discord.js');
const { supabase } = require('../lib/supabase');

module.exports = {
  name: 'guildMemberRemove',
  async execute(member) {
    const channel = member.guild.channels.cache.get(process.env.LEAVE_CHANNEL_ID);
    
    // ── 1. Message de départ ──────────────────────────────
    if (channel) {
      const embed = new EmbedBuilder()
        .setColor('#e74c3c')
        .setAuthor({ 
          name: `${member.user.username} nous a quittés`, 
          iconURL: member.user.displayAvatarURL({ dynamic: true }) 
        })
        .setDescription(`${member.user} a quitté la Prairie 🍂\nOn te souhaite bonne route !`)
        .setFooter({ text: 'Prairie Brawl Stars' })
        .setTimestamp();

      await channel.send({ embeds: [embed] });
    }

    // ── 2. Suppression Supabase ───────────────────────────
    const { error } = await supabase
      .from('members')
      .delete()
      .eq('discord_id', member.user.id);

    if (error) console.error('[Supabase] Erreur delete member:', error);
  }
};