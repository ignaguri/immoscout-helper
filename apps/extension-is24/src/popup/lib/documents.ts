// Client-side Mieterselbstauskunft PDF generation. Ports the Python
// fill_selbstauskunft.py: draws text at fixed coordinates onto the bundled
// template (which has no AcroForm fields) and appends user-uploaded attachments.
// Runs entirely in the popup (DOM context) - no server, no Python.

import { PDFDocument, type PDFFont, type PDFPage, StandardFonts } from 'pdf-lib';
import { getAttachmentBlobs } from '../../shared/idb-attachments';
import { loadAllSettings } from './storage';

const TEMPLATE_URL = 'templates/Selbstauskunft____neutral.pdf';
const COL_X = 250;

export interface DocumentsFormData {
  address: string;
  moveIn: string;
  name: string;
  maritalStatus: string;
  birthDate: string;
  currentAddress: string;
  phone: string;
  email: string;
  profession: string;
  netIncome: string;
  employer: string;
  employedSince: string;
  currentLandlord: string;
  landlordPhone: string;
  landlordEmail: string;
  signingDate: string;
  signatureName: string;
}

// ISO date (YYYY-MM-DD from a date input) -> German DD.MM.YYYY. Leaves other input as-is.
function formatDate(isoDate: string | undefined): string {
  if (!isoDate?.includes('-')) {
    return isoDate || '';
  }
  const [year, month, day] = isoDate.split('-');
  return `${day}.${month}.${year}`;
}

// Plain number -> German currency "X.XXX,XX EUR".
function formatEurAmount(val: string | number | undefined): string {
  if (!val) {
    return '';
  }
  const num = Number.parseFloat(String(val));
  if (Number.isNaN(num)) {
    return String(val);
  }
  const parts = num.toFixed(2).split('.');
  const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${intPart},${parts[1]} EUR`;
}

function todayGermanDate(): string {
  const today = new Date();
  const day = String(today.getDate()).padStart(2, '0');
  const month = String(today.getMonth() + 1).padStart(2, '0');
  return `${day}.${month}.${today.getFullYear()}`;
}

// Split on the first comma into up to two trimmed parts (street/city, employer/address).
function splitFirstComma(value: string): string[] {
  const idx = value.indexOf(',');
  if (idx === -1) {
    return [value];
  }
  return [value.slice(0, idx).trim(), value.slice(idx + 1).trim()];
}

// Gather profile data from the popup's typed settings and format it into the
// shape the template filler expects. Ported from background/message-handler.ts.
export async function buildDocumentData(address: string, moveIn: string): Promise<DocumentsFormData> {
  const settings = await loadAllSettings();

  const nameRaw = settings.profileName || '';
  // Convert "First Last" to "Last, First" for the form.
  const nameParts = nameRaw.split(' ').filter(Boolean);
  const formName = nameParts.length >= 2 ? `${nameParts.slice(1).join(' ')}, ${nameParts[0]}` : nameRaw;

  return {
    address,
    name: formName,
    moveIn: formatDate(moveIn),
    birthDate: formatDate(settings.profileBirthDate),
    maritalStatus: settings.profileMaritalStatus || '',
    currentAddress: settings.profileCurrentAddress || '',
    phone: settings.formPhone || '',
    email: settings.profileEmail || '',
    profession: settings.profileOccupation || '',
    netIncome: formatEurAmount(settings.profileNetIncome),
    employer: settings.profileEmployer || '',
    employedSince: formatDate(settings.profileEmployedSince),
    currentLandlord: settings.profileCurrentLandlord || '',
    landlordPhone: settings.profileLandlordPhone || '',
    landlordEmail: settings.profileLandlordEmail || '',
    signingDate: todayGermanDate(),
    signatureName: nameRaw,
  };
}

// Draws page 1. Coordinates copied verbatim from create_overlay_page1 in the
// Python source. pdf-lib origin is bottom-left, matching reportlab.
function drawPage1(page: PDFPage, helv: PDFFont, helvBold: PDFFont, data: DocumentsFormData): void {
  const put = (x: number, y: number, text: string, size = 10, font = helv) => {
    page.drawText(text, { x, y, size, font });
  };

  put(45, 708, data.address);
  put(75, 661, data.moveIn);
  put(COL_X, 496, data.name);
  put(COL_X, 476, data.maritalStatus);
  put(COL_X, 457, data.birthDate);

  const addressLines = splitFirstComma(data.currentAddress);
  put(COL_X, 440, addressLines[0]);
  if (addressLines.length > 1) {
    put(COL_X, 427, addressLines[1]);
  }

  put(COL_X, 369, data.phone);
  put(COL_X, 350, data.email);
  put(COL_X, 331, data.profession);
  put(COL_X, 312, data.netIncome);

  // Employer (Helvetica 9), split on first comma into up to 2 lines.
  const employerLines = splitFirstComma(data.employer);
  put(COL_X, 295, employerLines[0], 9);
  if (employerLines.length > 1) {
    put(COL_X, 283, employerLines[1], 9);
  }
  if (data.employedSince) {
    const yEmployed = employerLines.length <= 1 ? 283 : 271;
    put(COL_X, yEmployed, `beschäftigt seit ${data.employedSince}`, 9);
  }

  // Current landlord (Helvetica 9).
  put(COL_X, 229, data.currentLandlord, 9);
  put(COL_X, 217, data.landlordPhone, 9);
  put(COL_X, 205, data.landlordEmail, 9);

  // "Weitere Personen" nein checkbox (Helvetica-Bold 11).
  put(399, 137, 'X', 11, helvBold);
}

// Draws page 2. Coordinates copied verbatim from create_overlay_page2.
function drawPage2(page: PDFPage, helv: PDFFont, helvBold: PDFFont, data: DocumentsFormData): void {
  // "nein" checkboxes (Helvetica-Bold 11).
  const neinX = 256;
  const rowsY = [753, 720, 681, 632, 591, 553, 508, 470];
  for (const y of rowsY) {
    page.drawText('X', { x: neinX, y, size: 11, font: helvBold });
  }

  // Ort, Datum (Helvetica 10).
  page.drawText(`München, ${data.signingDate}`, { x: 40, y: 185, size: 10, font: helv });

  // Signature (Helvetica 10).
  page.drawText(data.signatureName, { x: 260, y: 185, size: 10, font: helv });
}

// Fills the template and appends stored attachments. Returns the final PDF bytes.
export async function fillSelbstauskunft(data: DocumentsFormData): Promise<Uint8Array> {
  const templateResp = await fetch(chrome.runtime.getURL(TEMPLATE_URL));
  if (!templateResp.ok) {
    throw new Error('Template PDF not found in extension bundle');
  }
  const templateBytes = await templateResp.arrayBuffer();

  const pdfDoc = await PDFDocument.load(templateBytes);
  const helv = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helvBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  drawPage1(pdfDoc.getPage(0), helv, helvBold, data);
  drawPage2(pdfDoc.getPage(1), helv, helvBold, data);

  // Append attachments in upload order. Skip any that fail to parse.
  const attachmentBlobs = await getAttachmentBlobs();
  for (const bytes of attachmentBlobs) {
    try {
      const donor = await PDFDocument.load(bytes);
      const copied = await pdfDoc.copyPages(donor, donor.getPageIndices());
      for (const donorPage of copied) {
        pdfDoc.addPage(donorPage);
      }
    } catch (err) {
      console.warn('[Documents] Skipping unreadable attachment:', err);
    }
  }

  return pdfDoc.save();
}

// Builds the download filename: Bewerbungsunterlagen_<LastName>_<Street>.pdf
export function documentFilename(address: string, name: string): string {
  const nameParts = name.split(' ').filter(Boolean);
  const lastName = nameParts[nameParts.length - 1] || 'Tenant';
  const street = address.split(',')[0].trim().replace(/\s+/g, '_') || 'output';
  return `Bewerbungsunterlagen_${lastName}_${street}.pdf`;
}
