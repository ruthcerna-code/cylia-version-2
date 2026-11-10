import { MenstrualPhase } from '../types';

export interface ActivityRecommendation {
  title: string;
  phaseName: string;
  description: string;
  why: string;
  illnessNotes: string[];
}

function conditionNotes(healthProfile: {
  isCeliac?: boolean;
  hasDiabetes?: boolean;
  hasObesity?: boolean;
  hasDepression?: boolean;
}): string[] {
  const notes: string[] = [];
  if (healthProfile.isCeliac) notes.push('Registraste celiaquía. Esta idea no cambia tu alimentación: sigue lo que ya te indicaron.');
  if (healthProfile.hasDiabetes) notes.push('Registraste diabetes. Esta idea no cambia tu insulina ni tu tratamiento. Si el malestar es fuerte, consulta a quien te atiende.');
  if (healthProfile.hasObesity) notes.push('Registraste obesidad. Elige un ritmo que no te duela. Esta idea no es un plan de peso.');
  if (healthProfile.hasDepression) notes.push('Registraste ánimo bajo o depresión. Un movimiento suave es una opción. No reemplaza el cuidado que ya tienes.');
  return notes;
}

export function generateActivityForDay(
  name: string,
  phase: MenstrualPhase | null,
  cycleDay: number,
  healthProfile: {
    isCeliac?: boolean;
    hasDiabetes?: boolean;
    hasObesity?: boolean;
    hasDepression?: boolean;
  }
): ActivityRecommendation {
  // We use cycleDay as a seed to select varying recommendations so they see a unique recommended activity for each day
  const index = cycleDay % 3;

  let title = "";
  let description = "";
  let why = "";
  const illnessNotes: string[] = [];

  const phaseNames = {
    Menstrual: "Menstruación",
    Folicular: "Fase Folicular",
    Ovulacion: "Ovulación",
    Lutea: "Fase Lútea"
  };

  if (!phase) {
    return {
      title: 'Movimiento según cómo te sientes',
      phaseName: 'Sin fase en el calendario',
      description: `${name}, el calendario no está mostrando fases. Elige un ritmo que coincida con la energía y el cansancio de tu registro.`,
      why: 'Esta nota no usa una fase porque el cálculo del ciclo no la está mostrando.',
      illnessNotes: conditionNotes(healthProfile),
    };
  }

  if (phase === 'Menstrual') {
    const options = [
      {
        title: "Sesión de Yoga Restaurativo y Estiramientos Profundos",
        description: `${name}, para hoy en tu fase de Menstruación (Día ${cycleDay}), te recomendamos realizar una sesión suave de yoga restaurativo con énfasis en la pelvis y la espalda baja. Enfócate en posturas como el Niño (Balasana) y la Mariposa reclinada (Supta Baddha Konasana), usando almohadas para apoyarte. Mantén una respiración abdominal lenta y profunda durante 20 minutos.`,
        why: "Muchas mujeres reportan menos energía en estos días. Es una opción suave, no una medición de tus hormonas."
      },
      {
        title: "Caminata Meditativa a Ritmo Suave al Aire Libre",
        description: `${name}, para este día ${cycleDay} de tu fase Menstrual, te sugerimos una caminata de baja intensidad de 15 a 20 minutos en un parque o entorno natural. Camina a un paso relajado, concentrándote en el contacto de tus pies con el suelo y en el aire fresco.`,
        why: "Muchas mujeres reportan que una caminata corta les sienta bien en estos días. Si tu registro marca mucho cansancio, puedes hacerla más breve."
      },
      {
        title: "Ejercicios de Respiración Convocada y Autocuidado con Calor Local",
        description: `${name}, en este día ${cycleDay} de tu ciclo (Fase Menstrual), te recomendamos una sesión de respiración diafragmática pausada (técnica 4-7-8) combinada con la aplicación de una compresa tibia sobre tu vientre o zona lumbar durante 20 minutos.`,
        why: "El calor y una respiración lenta son opciones que muchas mujeres prueban si registran dolor. No es un tratamiento."
      }
    ];
    const sel = options[index];
    title = sel.title;
    description = sel.description;
    why = sel.why;

    illnessNotes.push(...conditionNotes(healthProfile));

  } else if (phase === 'Folicular') {
    const options = [
      {
        title: "Entrenamiento de Fuerza con Peso Corporal (Calistenia)",
        description: `${name}, para hoy en tu Fase Folicular (Día ${cycleDay}), te sugerimos un entrenamiento de fuerza de intensidad moderada, utilizando tu propio peso corporal (sentadillas, flexiones apoyadas, zancadas y planchas). Realiza 3 series de 10 repeticiones por ejercicio con descansos de 1 minuto.`,
        why: "Muchas mujeres reportan más energía en estos días. Si tu registro marca poca, elige menos repeticiones."
      },
      {
        title: "Sesión de Cardio Dinámico de Ritmo Moderado (Power Walking o Ciclismo)",
        description: `${name}, para hoy en tu Fase Folicular (Día ${cycleDay}), te sugerimos 30 minutos de ciclismo ligero o caminata rápida (Power Walking). Mantén una intensidad en la que puedas hablar pero con esfuerzo constante.`,
        why: "Muchas mujeres reportan más facilidad para moverse en estos días. Tu concentración es la que marques en el registro."
      },
      {
        title: "Entrenamiento de Resistencia y Core (Pilates Dinámico)",
        description: `${name}, hoy en tu Día ${cycleDay} (Fase Folicular), te recomendamos una sesión de Pilates dinámico enfocada en el fortalecimiento del core, glúteos y espalda. Realiza movimientos fluidos y controlados durante 25 minutos.`,
        why: "Es una opción de movimiento. Cyclia no mide tus hormonas ni tu fuerza."
      }
    ];
    const sel = options[index];
    title = sel.title;
    description = sel.description;
    why = sel.why;

    illnessNotes.push(...conditionNotes(healthProfile));

  } else if (phase === 'Ovulacion') {
    const options = [
      {
        title: "Entrenamiento de Alta Intensidad por Intervalos (HIIT)",
        description: `${name}, hoy en tu fase de Ovulación (Día ${cycleDay}), te recomendamos un entrenamiento tipo HIIT de 20 minutos (20 segundos de esfuerzo máximo como jumping jacks o burpees, seguidos de 40 segundos de descanso activo). Completa 3 rondas.`,
        why: "Muchas mujeres reportan más ganas de moverse cerca de la ovulación estimada. No es un cálculo de fertilidad ni de tus hormonas. Si el registro marca poca energía, no hace falta un ritmo alto."
      },
      {
        title: "Sesión de Running de Ritmo Sostenido o Clase de Baile Dinámica",
        description: `${name}, para hoy en tu fase de Ovulación (Día ${cycleDay}), te recomendamos una carrera de ritmo sostenido de 25 minutos o una clase de baile de alto ritmo energético para divertirte al máximo.`,
        why: "Correr o bailar es una opción. Tu ánimo es el del registro, no una hormona medida."
      },
      {
        title: "Entrenamiento de Fuerza Máxima o Levantamiento de Peso Controlado",
        description: `${name}, en este día ${cycleDay} de tu ciclo (Fase de Ovulación), te sugerimos un entrenamiento de fuerza con pesas o mancuernas para retar tus músculos de manera segura. Realiza levantamientos lentos y controlados de tus grupos musculares mayores.`,
        why: "Una carga moderada es una opción si te sientes con fuerza. Cyclia no mide testosterona ni fuerza muscular."
      }
    ];
    const sel = options[index];
    title = sel.title;
    description = sel.description;
    why = sel.why;

    illnessNotes.push(...conditionNotes(healthProfile));

  } else { // Lutea
    const options = [
      {
        title: "Sesión de Pilates de Pared o Control Postural",
        description: `${name}, hoy en tu Fase Lútea (Día ${cycleDay}), te recomendamos realizar una rutina de Pilates de pared de 25 minutos. Concéntrate en movimientos controlados para fortalecer el transverso abdominal, glúteos e isquiotibiales utilizando la pared como resistencia.`,
        why: "Muchas mujeres reportan un ritmo más lento en estos días. El Pilates de pared es una opción, no una medición hormonal."
      },
      {
        title: "Caminata de Resistencia Ligera-Moderada en la Naturaleza",
        description: `${name}, para hoy en tu Fase Lútea (Día ${cycleDay}), te sugerimos una caminata continua a paso moderado de 30 a 40 minutos. Mantén una respiración rítmica y enfócate en el paisaje para relajar tu mente.`,
        why: "Una caminata es una opción. Tu energía y tu ánimo salen del registro, no de un cálculo de combustible."
      },
      {
        title: "Yoga Vinyasa Suave y Flexibilidad para el Core",
        description: `${name}, en este día ${cycleDay} de tu ciclo (Fase Lútea), te recomendamos realizar una sesión de yoga Vinyasa fluido de ritmo suave enfocado en abrir caderas y estirar la columna. Finaliza con 5 minutos de relajación guiada (Savasana).`,
        why: "Un yoga suave es una opción que muchas mujeres prueban en estos días. No diagnostica un síndrome ni mide cortisol."
      }
    ];
    const sel = options[index];
    title = sel.title;
    description = sel.description;
    why = sel.why;

    illnessNotes.push(...conditionNotes(healthProfile));
  }

  return {
    title,
    phaseName: phaseNames[phase],
    description,
    why,
    illnessNotes
  };
}
