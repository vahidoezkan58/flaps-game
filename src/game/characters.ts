export type CharacterId = 'bunny' | 'david' | 'frog' | 'cat' | 'chick' | 'crown' | 'custom';

export interface CharacterDef {
  id: CharacterId;
  name: string;
  tagline: string;
  accent: string;
}

export const CHARACTERS: CharacterDef[] = [
  {
    id: 'bunny',
    name: 'Flaps-Hase',
    tagline: 'Das Original',
    accent: '#F472B6',
  },
  {
    id: 'david',
    name: 'Marmor-Büste',
    tagline: 'Mit Pixel-Brille',
    accent: '#22C55E',
  },
  {
    id: 'frog',
    name: 'Pixel-Frosch',
    tagline: 'Extra Sprungkraft',
    accent: '#4ADE80',
  },
  {
    id: 'cat',
    name: 'Cyber-Katze',
    tagline: 'Mit Neon-Visier',
    accent: '#38BDF8',
  },
  {
    id: 'chick',
    name: 'Turbo-Küken',
    tagline: 'Schnell & goldig',
    accent: '#FACC15',
  },
  {
    id: 'crown',
    name: 'Gold-Krone',
    tagline: 'VIP Champion',
    accent: '#F59E0B',
  },
];

export function isCharacterId(value: string | null): value is CharacterId {
  return (
    value === 'bunny' ||
    value === 'david' ||
    value === 'frog' ||
    value === 'cat' ||
    value === 'chick' ||
    value === 'crown' ||
    value === 'custom'
  );
}

/**
 * Shared high-detail character sprite renderer centered at (0, 0) for radius `r` (default 13).
 * Used both in-game at 60fps and inside the Character Selection modal so previews match 1:1.
 */
export function drawCharacterSprite(
  ctx: CanvasRenderingContext2D,
  id: CharacterId,
  r = 13,
  customFaceImg?: CanvasImageSource | null
): void {
  const s = r / 13;
  ctx.save();
  ctx.scale(s, s);

  // Soft aura glow behind all characters
  const aura = ctx.createRadialGradient(0, 0, 4, 0, 0, 22);
  aura.addColorStop(0, 'rgba(255, 255, 255, 0.36)');
  aura.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = aura;
  ctx.beginPath();
  ctx.arc(0, 0, 22, 0, Math.PI * 2);
  ctx.fill();

  if (id === 'custom') {
    if (customFaceImg) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(0, 0, 12.8, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();

      const imgW =
        customFaceImg instanceof HTMLImageElement
          ? customFaceImg.naturalWidth || customFaceImg.width
          : (customFaceImg as HTMLCanvasElement).width;
      const imgH =
        customFaceImg instanceof HTMLImageElement
          ? customFaceImg.naturalHeight || customFaceImg.height
          : (customFaceImg as HTMLCanvasElement).height;

      if (imgW > 0 && imgH > 0) {
        const side = Math.min(imgW, imgH);
        const sx = (imgW - side) / 2;
        const sy = (imgH - side) / 2;
        ctx.drawImage(customFaceImg, sx, sy, side, side, -13, -13, 26, 26);
      }
      ctx.restore();

      // Crisp white sticker outline so uploaded face pops cleanly in-game
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 1.9;
      ctx.beginPath();
      ctx.arc(0, 0, 12.8, 0, Math.PI * 2);
      ctx.stroke();

      ctx.restore();
      return;
    }

    // Fallback smiley if custom photo not yet loaded
    ctx.fillStyle = '#FFE4EF';
    ctx.beginPath();
    ctx.arc(0, 0, 12.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.fillStyle = '#18121B';
    ctx.beginPath();
    ctx.arc(-4, -2, 1.6, 0, Math.PI * 2);
    ctx.arc(4, -2, 1.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }

  if (id === 'bunny') {
    // Back ear
    ctx.fillStyle = '#F7E7EE';
    ctx.beginPath();
    ctx.ellipse(-4.2, -13.5, 3.2, 6.2, -0.18, 0, Math.PI * 2);
    ctx.fill();

    // Front ear
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.ellipse(3.6, -14, 3.4, 6.5, 0.14, 0, Math.PI * 2);
    ctx.fill();

    // Body
    const bodyGrad = ctx.createRadialGradient(-3, -4, 2, 0, 0, 15);
    bodyGrad.addColorStop(0, '#FFFFFF');
    bodyGrad.addColorStop(0.78, '#FFF5F8');
    bodyGrad.addColorStop(1, '#F3CCD9');
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.arc(0, 0, 13, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // Cute eye
    ctx.fillStyle = '#18121B';
    ctx.beginPath();
    ctx.arc(5.5, -2, 2.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(6.2, -2.7, 0.75, 0, Math.PI * 2);
    ctx.fill();
  } else if (id === 'david') {
    // Sculpted white marble bust with retro neon-green pixel shades!
    // Neck & pedestal shoulder
    ctx.fillStyle = '#DCDAD4';
    ctx.beginPath();
    ctx.moveTo(-7.5, 12.5);
    ctx.lineTo(-5, 5);
    ctx.lineTo(5, 5);
    ctx.lineTo(8, 12.5);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#EBE9E2';
    ctx.fillRect(-9, 10.5, 18, 2.6);

    // Sculpted head
    const marbleGrad = ctx.createRadialGradient(-3, -3, 2, 0, -2, 13);
    marbleGrad.addColorStop(0, '#FFFFFF');
    marbleGrad.addColorStop(0.72, '#EAE7DF');
    marbleGrad.addColorStop(1, '#C9C4B8');
    ctx.fillStyle = marbleGrad;
    ctx.beginPath();
    ctx.ellipse(0, -2, 9.5, 11, 0, 0, Math.PI * 2);
    ctx.fill();

    // Curly marble hair puffs on top
    ctx.fillStyle = '#F5F3EE';
    const curls: Array<[number, number, number]> = [
      [-6.5, -10.5, 3.6],
      [-2, -12.5, 4.1],
      [3.2, -12.2, 3.9],
      [7, -9.5, 3.2],
      [-8.5, -6.5, 2.8],
    ];
    for (let i = 0; i < curls.length; i++) {
      const [cx, cy, cr] = curls[i];
      ctx.beginPath();
      ctx.arc(cx, cy, cr, 0, Math.PI * 2);
      ctx.fill();
    }

    // Subtle sculpted nose & chin shadow
    ctx.fillStyle = '#BFB9AC';
    ctx.fillRect(3.2, -2.5, 2.2, 4.2);

    // Neon-green retro pixel sunglasses (deal-with-it style!)
    ctx.fillStyle = '#22C55E';
    ctx.fillRect(-1.5, -5.8, 12.5, 2.2); // bridge/brow bar
    ctx.fillRect(-1, -4, 5.5, 3.4); // left lens
    ctx.fillRect(5.5, -4, 5.5, 3.4); // right lens
    ctx.fillRect(-7, -5.2, 6, 1.8); // temple arm

    // Crisp white pixel glare on lenses
    ctx.fillStyle = '#DCFCE7';
    ctx.fillRect(0, -3.5, 1.8, 1.4);
    ctx.fillRect(6.5, -3.5, 1.8, 1.4);
  } else if (id === 'frog') {
    // Retro arcade frog with big top eyes & rosy cheeks
    // Top eye bumps
    ctx.fillStyle = '#22C55E';
    ctx.beginPath();
    ctx.arc(-4.5, -10.5, 4.6, 0, Math.PI * 2);
    ctx.arc(5.5, -10.5, 4.6, 0, Math.PI * 2);
    ctx.fill();

    // Main round body
    const frogGrad = ctx.createRadialGradient(-3, -3, 2, 0, 0, 14);
    frogGrad.addColorStop(0, '#86EFAC');
    frogGrad.addColorStop(0.65, '#22C55E');
    frogGrad.addColorStop(1, '#15803D');
    ctx.fillStyle = frogGrad;
    ctx.beginPath();
    ctx.arc(0, 0, 12.8, 0, Math.PI * 2);
    ctx.fill();

    // Pale belly highlight
    ctx.fillStyle = '#DCFCE7';
    ctx.beginPath();
    ctx.ellipse(1.5, 5.5, 8.2, 5.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Big white eyeballs
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(-4.2, -10.5, 3.1, 0, Math.PI * 2);
    ctx.arc(5.6, -10.5, 3.1, 0, Math.PI * 2);
    ctx.fill();

    // Pupils looking forward
    ctx.fillStyle = '#111111';
    ctx.beginPath();
    ctx.arc(-3.2, -10.5, 1.5, 0, Math.PI * 2);
    ctx.arc(6.6, -10.5, 1.5, 0, Math.PI * 2);
    ctx.fill();

    // Rosy pixel cheek & happy smile
    ctx.fillStyle = 'rgba(251, 113, 133, 0.72)';
    ctx.beginPath();
    ctx.arc(7.5, -1.5, 2.3, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#14532D';
    ctx.lineWidth = 1.4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(3.5, -1.2, 4.5, 0.15, 1.25);
    ctx.stroke();
  } else if (id === 'cat') {
    // Cyber-Katze: pastel lavender-white cat with pointed ears & glowing cyan visor
    // Left & right pointed ears
    ctx.fillStyle = '#DDD6FE';
    ctx.beginPath();
    ctx.moveTo(-9, -4);
    ctx.lineTo(-7.5, -15.5);
    ctx.lineTo(-1, -10);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#F5F3FF';
    ctx.beginPath();
    ctx.moveTo(1, -10);
    ctx.lineTo(7, -15.5);
    ctx.lineTo(9.5, -4);
    ctx.closePath();
    ctx.fill();

    // Inner pink ear triangles
    ctx.fillStyle = '#F472B6';
    ctx.beginPath();
    ctx.moveTo(-7.5, -7);
    ctx.lineTo(-6.7, -13);
    ctx.lineTo(-3, -9.5);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(2.5, -9.5);
    ctx.lineTo(6.5, -13);
    ctx.lineTo(7.8, -7);
    ctx.closePath();
    ctx.fill();

    // Head body
    const catGrad = ctx.createRadialGradient(-3, -4, 2, 0, 0, 14);
    catGrad.addColorStop(0, '#FFFFFF');
    catGrad.addColorStop(0.75, '#EDE9FE');
    catGrad.addColorStop(1, '#C4B5FD');
    ctx.fillStyle = catGrad;
    ctx.beginPath();
    ctx.arc(0, 0, 12.6, 0, Math.PI * 2);
    ctx.fill();

    // Glowing cyan cyber visor across eyes
    ctx.fillStyle = '#0F172A';
    ctx.fillRect(-3.5, -5.2, 14.5, 5);
    ctx.fillStyle = '#38BDF8';
    ctx.fillRect(-2.5, -4.2, 12.5, 3);
    ctx.fillStyle = '#E0F2FE';
    ctx.fillRect(0, -3.7, 4, 1.3);
    ctx.fillRect(6.5, -3.7, 2.5, 1.3);

    // Tiny pink nose & whiskers
    ctx.fillStyle = '#FB7185';
    ctx.beginPath();
    ctx.arc(6.5, 2.2, 1.4, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#7C3AED';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-4, 2);
    ctx.lineTo(-9, 1);
    ctx.moveTo(-4, 4);
    ctx.lineTo(-9, 5);
    ctx.stroke();
  } else if (id === 'crown') {
    // Gold-Krone VIP Champion: gleaming gold orb wearing a ruby-studded royal crown
    // Crown base & 3 points on top
    ctx.fillStyle = '#FDE047';
    ctx.beginPath();
    ctx.moveTo(-7.5, -9.5);
    ctx.lineTo(-8.5, -17.5);
    ctx.lineTo(-3.5, -13);
    ctx.lineTo(0, -19.5);
    ctx.lineTo(3.5, -13);
    ctx.lineTo(8.5, -17.5);
    ctx.lineTo(7.5, -9.5);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = '#B45309';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // Ruby & emerald jewels on crown
    ctx.fillStyle = '#EF4444';
    ctx.beginPath();
    ctx.arc(0, -13, 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#38BDF8';
    ctx.beginPath();
    ctx.arc(-4.8, -11.8, 1.1, 0, Math.PI * 2);
    ctx.arc(4.8, -11.8, 1.1, 0, Math.PI * 2);
    ctx.fill();

    // Golden body
    const goldGrad = ctx.createRadialGradient(-3, -4, 2, 0, 0, 14);
    goldGrad.addColorStop(0, '#FEF9C3');
    goldGrad.addColorStop(0.55, '#FACC15');
    goldGrad.addColorStop(1, '#CA8A04');
    ctx.fillStyle = goldGrad;
    ctx.beginPath();
    ctx.arc(0, 0, 13, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#FEF08A';
    ctx.lineWidth = 1.4;
    ctx.stroke();

    // Cool dark sunglasses
    ctx.fillStyle = '#111827';
    ctx.fillRect(-2, -4.5, 13, 4.2);
    ctx.fillStyle = '#FEF08A';
    ctx.fillRect(0, -3.7, 3.2, 1.2);
    ctx.fillRect(6.5, -3.7, 2.5, 1.2);
  } else {
    // Turbo-Küken: bright gold arcade chick with tuft & orange beak
    // Feather tuft on top
    ctx.fillStyle = '#FDE047';
    ctx.beginPath();
    ctx.ellipse(-1.5, -13.5, 2.3, 4.5, -0.35, 0, Math.PI * 2);
    ctx.ellipse(2, -14, 2.1, 4.2, 0.25, 0, Math.PI * 2);
    ctx.fill();

    // Round body
    const chickGrad = ctx.createRadialGradient(-3, -4, 2, 0, 0, 14);
    chickGrad.addColorStop(0, '#FEF08A');
    chickGrad.addColorStop(0.7, '#FACC15');
    chickGrad.addColorStop(1, '#EAB308');
    ctx.fillStyle = chickGrad;
    ctx.beginPath();
    ctx.arc(0, 0, 12.8, 0, Math.PI * 2);
    ctx.fill();

    // Little wing
    ctx.fillStyle = '#FEF9C3';
    ctx.beginPath();
    ctx.ellipse(-4.5, 2.5, 5.2, 3.6, -0.25, 0, Math.PI * 2);
    ctx.fill();

    // Expressive eye
    ctx.fillStyle = '#18121B';
    ctx.beginPath();
    ctx.arc(5.2, -3.2, 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(5.9, -3.9, 0.8, 0, Math.PI * 2);
    ctx.fill();

    // Orange beak sticking out right
    ctx.fillStyle = '#F97316';
    ctx.beginPath();
    ctx.moveTo(10.5, -2.5);
    ctx.lineTo(16, 0);
    ctx.lineTo(10.5, 2.6);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#FB923C';
    ctx.beginPath();
    ctx.moveTo(10.5, -2.5);
    ctx.lineTo(16, 0);
    ctx.lineTo(10.5, 0);
    ctx.closePath();
    ctx.fill();
  }

  ctx.restore();
}
