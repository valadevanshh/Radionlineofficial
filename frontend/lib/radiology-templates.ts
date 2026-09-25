export const MODALITY_OPTIONS = [
  'X-Ray Chest',
  'X-Ray Spine',
  'X-Ray Extremities',
  'X-Ray Pelvis / Abdomen',
  'CT Scan',
  'MRI',
  'Ultrasound',
  'Mammography',
  'PET-CT',
  'DEXA / Bone Densitometry',
  'Fluoroscopy',
  'General / Other',
];

export const RADIOLOGY_TEMPLATES = [
  {
    title: 'Chest PA — Normal Study',
    bodyPart: 'CHEST PA',
    findings: `<b>LUNG FIELDS:</b> Both lung fields are clear without focal consolidation, nodule, or mass. Normal bronchovascular markings.<br/><b>CARDIOVASCULAR:</b> Cardiac size and silhouette are within normal limits. Aortic arch is non-dilated.<br/><b>PLEURA & DIAPHRAGM:</b> Both costophrenic and cardiophrenic angles are clear. Both domes of diaphragm are smooth and normal in contour.<br/><b>MEDIASTINUM & BONES:</b> Hilar structures are within normal limits. Trachea is central. Thoracic osseous structures appear normal.`,
    impression: `<b>IMPRESSION:</b><br/>1. Unremarkable Digital Chest Radiograph (PA View).<br/>2. No active parenchymal or pleural lesion detected.`,
  },
  {
    title: 'Knee Joint AP/LAT — Osteoarthritis',
    bodyPart: 'KNEE JOINT',
    findings: `<b>JOINT SPACE:</b> Reduction of medial tibiofemoral joint space noted.<br/><b>OSSEOUS STRUCTURES:</b> Marginal osteophyte formation along the femoral condyles and tibial articular margins. Subchondral sclerosis seen.<br/><b>SOFT TISSUE:</b> Joint alignment is preserved. Mild suprapatellar soft tissue thickening noted.`,
    impression: `<b>IMPRESSION:</b><br/>Radiological findings are suggestive of Moderate Osteoarthritic changes (Kellgren-Lawrence Grade II/III) in the knee joint.`,
  },
  {
    title: 'Lumbar Spine AP/LAT — Lumbar Spondylosis',
    bodyPart: 'LUMBAR SPINE',
    findings: `<b>ALIGNMENT:</b> Lumbar lordosis is straightened, likely secondary to muscular spasm.<br/><b>DISC SPACES:</b> Mild narrowing of L4-L5 and L5-S1 intervertebral disc spaces.<br/><b>VERTEBRAL BODIES:</b> Anterior vertebral body osteophytes seen at L3 through L5 levels. Vertebral body heights and pedicles are preserved.`,
    impression: `<b>IMPRESSION:</b><br/>Lumbar Spondylosis with disc space narrowing at L4-L5 and L5-S1 levels.`,
  },
  {
    title: 'Brain CT — Normal Non-Contrast Study',
    bodyPart: 'BRAIN / HEAD',
    findings: `<b>BRAIN PARENCHYMA:</b> No acute cerebral infarction, intracranial hemorrhage, or space-occupying lesion identified. Cerebral sulci and basal cisterns are age-appropriate.<br/><b>VENTRICULAR SYSTEM:</b> Ventricles demonstrate normal size, configuration, and symmetry. No midline shift.<br/><b>BONES & SINUSES:</b> Calvarium is intact. Paranasal sinuses and mastoid air cells are clear.`,
    impression: `<b>IMPRESSION:</b><br/>Unremarkable NCCT Brain Study. No evidence of acute intracranial pathology.`,
  },
];
