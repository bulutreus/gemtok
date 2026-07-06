import type { PlayerEntity } from "../playerEntity";
import { GAMEPLAY } from "../gameConfig";

export interface CombatCallbacks {
  onDamage: (attacker: PlayerEntity, victim: PlayerEntity, amount: number, showText: string) => void;
  onEliminate: (victim: PlayerEntity, killer: PlayerEntity) => void;
}

export function applyContactDamage(
  a: PlayerEntity,
  b: PlayerEntity,
  now: number,
  cb: CombatCallbacks
): void {
  const { contactIntervalMs, contactBaseDamage, contactStrongRatio, contactWeakRatio } =
    GAMEPLAY.combat;
  const { min: minMass } = GAMEPLAY.mass;

  const tryHit = (att: PlayerEntity, vic: PlayerEntity): void => {
    if (att === vic) return;
    if (vic.weapon === "god_mode" && vic.isWeaponActive(now)) return;
    if (now < vic.invulnUntil) return;
    if (now - vic.lastContactDamageAt < contactIntervalMs) return;

    const attStrong = att.mass >= vic.mass * contactStrongRatio;
    const attMelee = att.isMeleeWeapon(now);

    if (!attMelee && !attStrong) return;
    if (!attMelee && att.mass < vic.mass * contactWeakRatio) return;

    let dmg: number = contactBaseDamage;
    if (attMelee) {
      dmg = contactBaseDamage * att.damageMultiplier();
    } else if (attStrong) {
      dmg = contactBaseDamage * Math.min(2.5, att.mass / (vic.mass + 1));
    }

    dmg = Math.max(1, Math.round(dmg));
    vic.mass -= dmg;
    vic.lastContactDamageAt = now;
    vic.hurtFlashUntil = now + GAMEPLAY.combat.hurtFlashMs;

    const showText = dmg <= 1 ? "-1" : `-${dmg}`;
    cb.onDamage(att, vic, dmg, showText);

    if (vic.mass < minMass) {
      cb.onEliminate(vic, att);
    }
  };

  /** Stronger / armed attacker first to avoid double-elimination race */
  if (a.mass >= b.mass) {
    tryHit(a, b);
    tryHit(b, a);
  } else {
    tryHit(b, a);
    tryHit(a, b);
  }
}

export function applyProjectileDamage(
  att: PlayerEntity,
  vic: PlayerEntity,
  rawDmg: number,
  now: number,
  cb: CombatCallbacks
): void {
  const { contactIntervalMs, projectileInvulnMs, hurtFlashMs } = GAMEPLAY.combat;
  const { min: minMass } = GAMEPLAY.mass;

  if (vic.weapon === "god_mode" && vic.isWeaponActive(now)) return;
  if (now < vic.invulnUntil) return;
  if (now - vic.lastContactDamageAt < contactIntervalMs * 0.5) return;

  const dmg = Math.max(1, Math.round(rawDmg));
  vic.mass -= dmg;
  vic.invulnUntil = now + projectileInvulnMs;
  vic.lastContactDamageAt = now;
  vic.hurtFlashUntil = now + hurtFlashMs;

  const showText = dmg <= 1 ? "-1" : `-${dmg}`;
  cb.onDamage(att, vic, dmg, showText);

  if (vic.mass < minMass) {
    cb.onEliminate(vic, att);
  }
}
