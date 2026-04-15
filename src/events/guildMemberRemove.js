const { AttachmentBuilder, EmbedBuilder } = require('discord.js');
const { supabase } = require('../lib/supabase');
const { generateWelcomeImage } = require('../modules/welcomeImage');

module.exports = {
  name: 'guildMemberRemove',
  async execute(member) {
    console.log(`[Leave] ${member.user.username} a quitté le serveur`);
    
    try {
      const channel = await member.guild.channels.fetch(process.env.LEAVE_CHANNEL_ID);
      
      if (channel) {
        const imageBuffer = await generateWelcomeImage(member.user, 'leave');
        const attachment = new AttachmentBuilder(imageBuffer, { name: 'leave.png' });

        const embed = new EmbedBuilder()
          .setColor('#e74c3c')
          .setDescription(
            `### 🍂 Une feuille s'envole...\n\n` +
            `**${member.user.username}** s'est envolé avec les feuilles mortes...\n` +
            `On garde ta place au chaud, reviens quand tu veux ! 🌾`
          )
          .setImage('attachment://leave.png')
          .setFooter({ text: 'Prairie Brawl Stars • À bientôt peut-être...' })
          .setTimestamp();

        await channel.send({ embeds: [embed], files: [attachment] });
        console.log(`[Leave] Message envoyé dans ${channel.name}`);
      } else {
        console.log('[Leave] Channel introuvable');
      }
    } catch (err) {
      console.error('[Leave] Erreur:', err);
    }

    const { error } = await supabase
      .from('members')
      .delete()
      .eq('discord_id', member.user.id);

    if (error) console.error('[Supabase] Erreur delete member:', error);
  }
};