/** "ram krishna" -> "Ram Krishna". Names already using capitals ("McDonald", "SivaKumar") stay as they are. */
/** First name for a greeting: from the person's name, otherwise the part of their email before the first . _ - or @. */
export const greetingName = (fullName, email) => titleName(String(fullName || "").trim().split(/\s+/)[0] || String(email || "").split("@")[0].split(/[._-]/)[0]);

export const titleName = (name) => String(name || "").replace(/\S+/g, (w) => (w === w.toLowerCase() ? w[0].toUpperCase() + w.slice(1) : w));
