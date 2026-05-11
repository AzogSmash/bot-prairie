const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const os  = require('os');
const fsp = require('fs').promises;

function formatUptime(ms) {
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const parts = [];
  if (d) parts.push(`${d}j`);
  if (h) parts.push(`${h}h`);
  parts.push(`${m}m`);
  return parts.join(' ');
}

function getCpuPercent() {
  return new Promise(resolve => {
    const t0 = process.cpuUsage();
    setTimeout(() => {
      const d = process.cpuUsage(t0);
      resolve(Math.min(100, ((d.user + d.system) / 1000 / 100) * 100).toFixed(1));
    }, 150);
  });
}

function bar(ratio, width = 22) {
  const filled = Math.round(Math.max(0, Math.min(1, ratio)) * width);
  return `\`${'█'.repeat(filled)}${'░'.repeat(width - filled)}\``;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Statut et performances du bot')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    await interaction.deferReply({ flags: 64 });

    const wsPing   = Math.round(interaction.client.ws.ping);
    const uptime   = formatUptime(interaction.client.uptime ?? 0);
    const cpuPct   = await getCpuPercent();

    const memUsed  = process.memoryUsage().rss / 1073741824;
    const memTotal = os.totalmem() / 1073741824;

    let diskUsed = null, diskTotal = null;
    try {
      const stat = await fsp.statfs('.');
      diskTotal = (stat.blocks * stat.bsize) / 1073741824;
      diskUsed  = diskTotal - (stat.bfree * stat.bsize) / 1073741824;
    } catch { /* indisponible sur certains OS */ }

    const lines = [
      `### 🟢 Pong !`,
      `**Uptime** \`${uptime}\`　　**Ping WS** \`${wsPing} ms\``,
      ``,
      `⚙️ **Ressources**`,
      `**CPU — ${cpuPct} %**`,
      bar(parseFloat(cpuPct) / 100),
      `Limit : 100 %`,
      ``,
      `**RAM — ${memUsed.toFixed(2)} GiB**`,
      bar(memUsed / memTotal),
      `Limit : ${memTotal.toFixed(2)} GiB`,
    ];

    if (diskUsed !== null) {
      lines.push(
        ``,
        `**Disque — ${diskUsed.toFixed(2)} GiB**`,
        bar(diskUsed / diskTotal),
        `Limit : ${diskTotal.toFixed(2)} GiB`,
      );
    }

    lines.push(``, `**Node.js** \`${process.version}\``);

    const now = new Date();
    const embed = new EmbedBuilder()
      .setColor('#2ecc71')
      .setDescription(lines.join('\n'))
      .setFooter({
        text: `Mis à jour : à l'instant • ${now.toLocaleDateString('fr-FR')} ${now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`,
      })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },
};
