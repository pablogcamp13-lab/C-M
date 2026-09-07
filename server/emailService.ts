import 'dotenv/config';
import { google } from 'googleapis';

const BRAND = 'C&M Calidad y Mejora Continua';
const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[character]!);
const base64Url = (value: string) => Buffer.from(value, 'utf8').toString('base64url');
const encodedHeader = (value: string) => `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;

const platformUrl = () => {
  if (process.env.PUBLIC_APP_URL) return process.env.PUBLIC_APP_URL.replace(/\/$/, '');
  if (process.env.RAILWAY_PUBLIC_DOMAIN) return `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
  return '';
};

class EmailService {
  get enabled() { return Boolean(process.env.GMAIL_CLIENT_ID && process.env.GMAIL_CLIENT_SECRET && process.env.GMAIL_REFRESH_TOKEN); }

  private auth() {
    const auth = new google.auth.OAuth2(process.env.GMAIL_CLIENT_ID, process.env.GMAIL_CLIENT_SECRET);
    auth.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN });
    return auth;
  }

  async sendEvaluationNotification(input: { recipient: string; advisorName: string; campaignName: string; date: string; result: string; evaluatorName: string; evaluationId: string }) {
    if (!this.enabled) return false;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.recipient)) return false;
    const gmail = google.gmail({ version: 'v1', auth: this.auth() });
    const sender = process.env.GMAIL_SENDER_EMAIL?.trim();
    const link = `${platformUrl()}/?section=evaluations&evaluationId=${encodeURIComponent(input.evaluationId)}`;
    const subject = `${BRAND}: Nueva Evaluación | ${input.advisorName} - ${input.campaignName}`;
    const button = platformUrl() ? `<a href="${escapeHtml(link)}" style="display:inline-block;background:linear-gradient(90deg,#15c7df,#2385ee);color:#031526;text-decoration:none;font-weight:700;padding:13px 24px;border-radius:9px">Ver evaluación</a>` : '';
    const html = `<!doctype html><html><body style="margin:0;background:#f1f5f9;font-family:Arial,sans-serif;color:#10243b"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:28px 12px"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 8px 30px rgba(2,20,38,.10)"><tr><td style="background:#06182c;padding:26px 32px;border-bottom:3px solid #1bc7df"><div style="font-size:22px;font-weight:700;color:#fff">C<span style="color:#1bc7df">&amp;</span>M</div><div style="margin-top:5px;color:#9fb2c8;font-size:12px">CALIDAD Y MEJORA CONTINUA</div></td></tr><tr><td style="padding:34px 32px"><h1 style="margin:0 0 8px;font-size:24px;color:#09213a">Nueva evaluación registrada</h1><p style="margin:0 0 25px;color:#64748b;font-size:14px">Se ha registrado una nueva evaluación en la plataforma.</p><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:10px 18px"><tr><td style="padding:10px;color:#64748b;font-size:13px">Asesor</td><td style="padding:10px;text-align:right;font-weight:700">${escapeHtml(input.advisorName)}</td></tr><tr><td style="padding:10px;color:#64748b;font-size:13px">Campaña</td><td style="padding:10px;text-align:right;font-weight:700">${escapeHtml(input.campaignName)}</td></tr><tr><td style="padding:10px;color:#64748b;font-size:13px">Fecha</td><td style="padding:10px;text-align:right;font-weight:700">${escapeHtml(input.date)}</td></tr><tr><td style="padding:10px;color:#64748b;font-size:13px">Resultado / puntaje</td><td style="padding:10px;text-align:right;font-weight:700;color:#087f9c">${escapeHtml(input.result)}</td></tr><tr><td style="padding:10px;color:#64748b;font-size:13px">Monitor</td><td style="padding:10px;text-align:right;font-weight:700">${escapeHtml(input.evaluatorName)}</td></tr></table><div style="padding-top:26px;text-align:center">${button}</div></td></tr><tr><td style="background:#f8fafc;padding:20px;text-align:center;color:#64748b;font-size:12px"><strong style="color:#10243b">${BRAND}</strong></td></tr></table></td></tr></table></body></html>`;
    const text = `Nueva evaluación registrada\n\nAsesor: ${input.advisorName}\nCampaña: ${input.campaignName}\nFecha: ${input.date}\nResultado / puntaje: ${input.result}\nMonitor: ${input.evaluatorName}${platformUrl() ? `\n\nVer evaluación: ${link}` : ''}\n\n${BRAND}`;
    const boundary = `cm_${Date.now().toString(36)}`;
    const raw = [...(sender ? [`From: ${encodedHeader(BRAND)} <${sender}>`] : []), `To: ${input.recipient}`, `Subject: ${encodedHeader(subject)}`, 'MIME-Version: 1.0', `Content-Type: multipart/alternative; boundary="${boundary}"`, '', `--${boundary}`, 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: 8bit', '', text, `--${boundary}`, 'Content-Type: text/html; charset=UTF-8', 'Content-Transfer-Encoding: 8bit', '', html, `--${boundary}--`].join('\r\n');
    await gmail.users.messages.send({ userId: 'me', requestBody: { raw: base64Url(raw) } });
    return true;
  }

  async sendSupervisorNotification(input: { recipient: string; subject: string; title: string; description: string; advisorName: string; campaignName: string; actionLabel: string; path: string }) {
    if (!this.enabled || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.recipient)) return false;
    const gmail = google.gmail({ version: 'v1', auth: this.auth() });
    const sender = process.env.GMAIL_SENDER_EMAIL?.trim();
    const link = platformUrl() ? `${platformUrl()}${input.path}` : '';
    const button = link ? `<a href="${escapeHtml(link)}" style="display:inline-block;background:linear-gradient(90deg,#15c7df,#2385ee);color:#031526;text-decoration:none;font-weight:700;padding:13px 24px;border-radius:9px">${escapeHtml(input.actionLabel)}</a>` : '';
    const html = `<!doctype html><html><body style="margin:0;background:#f1f5f9;font-family:Arial,sans-serif;color:#10243b"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:28px 12px"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 8px 30px rgba(2,20,38,.10)"><tr><td style="background:#06182c;padding:26px 32px;border-bottom:3px solid #1bc7df"><div style="font-size:22px;font-weight:700;color:#fff">C<span style="color:#1bc7df">&amp;</span>M</div><div style="margin-top:5px;color:#9fb2c8;font-size:12px">CALIDAD Y MEJORA CONTINUA</div></td></tr><tr><td style="padding:34px 32px"><h1 style="margin:0 0 8px;font-size:24px;color:#09213a">${escapeHtml(input.title)}</h1><p style="margin:0 0 25px;color:#64748b;font-size:14px">${escapeHtml(input.description)}</p><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:10px 18px"><tr><td style="padding:10px;color:#64748b;font-size:13px">Asesor</td><td style="padding:10px;text-align:right;font-weight:700">${escapeHtml(input.advisorName)}</td></tr><tr><td style="padding:10px;color:#64748b;font-size:13px">Campaña</td><td style="padding:10px;text-align:right;font-weight:700">${escapeHtml(input.campaignName)}</td></tr></table><div style="padding-top:26px;text-align:center">${button}</div></td></tr><tr><td style="background:#f8fafc;padding:20px;text-align:center;color:#64748b;font-size:12px"><strong style="color:#10243b">${BRAND}</strong></td></tr></table></td></tr></table></body></html>`;
    const text = `${input.title}\n\n${input.description}\nAsesor: ${input.advisorName}\nCampaña: ${input.campaignName}${link ? `\n\n${input.actionLabel}: ${link}` : ''}\n\n${BRAND}`;
    const boundary = `cm_${Date.now().toString(36)}`;
    const raw = [...(sender ? [`From: ${encodedHeader(BRAND)} <${sender}>`] : []), `To: ${input.recipient}`, `Subject: ${encodedHeader(input.subject)}`, 'MIME-Version: 1.0', `Content-Type: multipart/alternative; boundary="${boundary}"`, '', `--${boundary}`, 'Content-Type: text/plain; charset=UTF-8', '', text, `--${boundary}`, 'Content-Type: text/html; charset=UTF-8', '', html, `--${boundary}--`].join('\r\n');
    await gmail.users.messages.send({ userId: 'me', requestBody: { raw: base64Url(raw) } });
    return true;
  }
}

export const emailService = new EmailService();
