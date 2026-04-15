// src/events/guildMemberRemove.js
const { AttachmentBuilder } = require('discord.js');
const { supabase } = require('../lib/supabase');
const { generateWelcomeImage } = require('../modules/welcomeImage');

module.exports = {
  name: 'guildMemberRemove',
  async execute(member) {
    console.log(`[Leave] ${member.user.username} a quitté le serveur`);
    
    try {
      // Fetch le channel au lieu de le récupérer du cache
      const channel = await member.guild.channels.fetch(process.env.LEAVE_CHANNEL_ID);
      
      if (channel) {
        const imageBuffer = await generateWelcomeImage(member.user, 'leave');
        const attachment = new AttachmentBuilder(imageBuffer, { name: 'leave.png' });

        await channel.send({ 
          content: `${member.user.username} a quitté la Prairie 🍂`,
          files: [attachment] 
        });
        console.log(`[Leave] Message envoyé dans ${channel.name}`);
      } else {
        console.log('[Leave] Channel introuvable');
      }
    } catch (err) {
      console.error('[Leave] Erreur:', err);
    }

    // Suppression Supabase
    const { error } = await supabase
      .from('members')
      .delete()
      .eq('discord_id', member.user.id);

    if (error) console.error('[Supabase] Erreur delete member:', error);
  }
};