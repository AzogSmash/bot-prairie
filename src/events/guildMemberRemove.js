// src/events/guildMemberRemove.js
const { AttachmentBuilder } = require('discord.js');
const { supabase } = require('../lib/supabase');
const { generateWelcomeImage } = require('../modules/welcomeImage');

module.exports = {
  name: 'guildMemberRemove',
  async execute(member) {
    const channel = member.guild.channels.cache.get(process.env.LEAVE_CHANNEL_ID);
    
    // ── 1. Image de départ ────────────────────────────────
    if (channel) {
      const imageBuffer = await generateWelcomeImage(member.user, 'leave');
      const attachment = new AttachmentBuilder(imageBuffer, { name: 'leave.png' });

      await channel.send({ 
        content: `${member.user.username} a quitté la Prairie 🍂`,
        files: [attachment] 
      });
    }

    // ── 2. Suppression Supabase ───────────────────────────
    const { error } = await supabase
      .from('members')
      .delete()
      .eq('discord_id', member.user.id);

    if (error) console.error('[Supabase] Erreur delete member:', error);
  }
};