const { AttachmentBuilder, EmbedBuilder } = require('discord.js');
const { supabase } = require('../lib/supabase');
const { generateWelcomeImage } = require('../modules/welcomeImage');
const { CLUB_ROLES } = require('../jobs/snapshots');

const PRAIRIE_CLUB_NAMES = new Set(Object.keys(CLUB_ROLES));

module.exports = {
  name: 'guildMemberRemove',
  async execute(member) {
    console.log(`[Leave] ${member.user.username} a quitté le serveur`);

    // Récupère le dernier club connu avant suppression
    const { data: memberData } = await supabase
      .from('members')
      .select('club_name')
      .eq('discord_id', member.user.id)
      .maybeSingle();

    const clubName    = memberData?.club_name ?? null;
    const wasPrairie  = clubName && PRAIRIE_CLUB_NAMES.has(clubName);

    let clubLine;
    if (wasPrairie) {
      clubLine = `🌿 Dernier club : **${clubName}**`;
    } else {
      clubLine = `🚪 N'a jamais mis les pieds dans un club de la Prairie... dommage pour lui ! 😏`;
    }

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
            `On garde ta place au chaud, reviens quand tu veux ! 🌾\n\n` +
            clubLine
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