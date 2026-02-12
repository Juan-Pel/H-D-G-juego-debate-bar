// Temas para debates - Controversiales y variados
export const TOPICS: string[] = [
  // 🔥 MUY CONTROVERSIALES
  "La tortura está justificada si salva vidas inocentes",
  "Los países ricos deberían poder comprar territorio de países pobres",
  "La eugenesia podría mejorar la humanidad",
  "Hitler hizo algunas cosas bien para Alemania",
  "El colonialismo trajo beneficios a los países colonizados",
  "Algunas razas son genéticamente superiores en ciertos aspectos",
  "Los pobres son pobres porque quieren",
  "Las mujeres deberían quedarse en casa criando hijos",
  "El Islam es incompatible con la democracia occidental",
  "Los homosexuales no deberían poder adoptar niños",
  "La esclavitud fue necesaria para el desarrollo económico",
  "Los discapacitados mentales no deberían poder votar",
  "La pena de muerte debería aplicarse a violadores",
  "Los inmigrantes ilegales deberían ser deportados sin excepciones",
  "El aborto es asesinato sin importar las circunstancias",
  "Las drogas deberían ser completamente legales",
  "La prostitución debería ser un trabajo regulado",
  "Los ricos merecen más derechos que los pobres",
  "La democracia es un sistema fallido",
  "Una dictadura benevolente es mejor que una democracia corrupta",
  
  // 🏛️ POLÍTICA Y SOCIEDAD
  "El capitalismo es la raíz de todos los males modernos",
  "El comunismo podría funcionar si se implementa correctamente",
  "Los políticos deberían ganar el salario mínimo",
  "Votar debería ser obligatorio y con multas",
  "Las fake news deberían ser un delito penal",
  "Las redes sociales deberían estar reguladas por el gobierno",
  "Los multimillonarios no deberían existir",
  "La religión debería prohibirse en espacios públicos",
  "El servicio militar debería ser obligatorio",
  "Los impuestos deberían ser del 70% para los más ricos",
  
  // 🤖 TECNOLOGÍA
  "La inteligencia artificial reemplazará a los humanos",
  "Deberíamos implantarnos chips cerebrales",
  "Los robots deberían tener derechos",
  "Internet debería ser un derecho humano básico",
  "Las criptomonedas son una estafa gigante",
  "Elon Musk es un genio incomprendido",
  "TikTok es más peligroso que las drogas para los jóvenes",
  "Los videojuegos causan violencia",
  "Deberíamos colonizar Marte antes de arreglar la Tierra",
  
  // ⛪ RELIGIÓN Y FILOSOFÍA
  "Dios no existe y la religión es un invento humano",
  "La vida no tiene sentido objetivo",
  "El libre albedrío es una ilusión",
  "Después de la muerte no hay nada",
  "Jesús fue solo un revolucionario político",
  "La Iglesia Católica es una organización criminal",
  "El budismo es superior a las religiones occidentales",
  "Los ateos son más inteligentes que los religiosos",
  
  // 💑 RELACIONES Y GÉNERO
  "El matrimonio es una institución obsoleta",
  "La monogamia es antinatural",
  "Los hombres y las mujeres nunca serán iguales",
  "El feminismo moderno es tóxico",
  "Existen más de dos géneros",
  "Los hombres son víctimas del sistema actual",
  "El amor romántico es una construcción social",
  "Tener hijos es egoísta en el mundo actual",
  "Las parejas deberían firmar contratos renovables en vez de casarse",
  
  // 🎓 EDUCACIÓN
  "La universidad es una pérdida de tiempo y dinero",
  "Los deberes escolares deberían prohibirse",
  "Las notas escolares deberían eliminarse",
  "Los profesores están sobrevalorados",
  "La educación en casa es mejor que la escuela",
  "Las matemáticas avanzadas son inútiles para la mayoría",
  
  // 🌍 MEDIO AMBIENTE
  "El cambio climático es exagerado",
  "Ser vegano es la única opción ética",
  "Los humanos son un virus para el planeta",
  "Deberíamos dejar de tener hijos para salvar el planeta",
  "Las mascotas deberían estar prohibidas",
  
  // 🤪 ABSURDOS Y DIVERTIDOS
  "La pizza con piña es una aberración",
  "Los gatos son mejores que los perros",
  "El reggaetón es música de calidad",
  "Los que se levantan temprano son superiores",
  "La Tierra podría ser plana",
  "Los Simpson predijeron todo",
  "El agua con gas es agua con actitud",
  "Dormir es una pérdida de tiempo",
  "Las personas que hablan solas son más inteligentes",
  "El lunes debería eliminarse del calendario",
  
  // ⚖️ DILEMAS MORALES
  "Robar para comer está justificado",
  "Mentir está bien si proteges a alguien",
  "La venganza es un plato que se sirve frío",
  "El fin justifica los medios",
  "Es ético matar a uno para salvar a cinco",
  "Los secretos destruyen las relaciones",
  "Perdonar es de débiles",
  "La lealtad es más importante que la honestidad",
  
  // 🎭 CULTURA POP
  "Marvel es mejor que DC",
  "El anime es superior al cine occidental",
  "Los influencers son parásitos sociales",
  "La música actual es basura comparada con la de antes",
  "Friends está sobrevalorada",
  "Harry Potter es literatura mediocre",
  "El fútbol es el opio del pueblo",
  "Los streamers no tienen un trabajo real",
  
  // 🌶️ EXTRA PICANTES
  "Tu ex tenía razón sobre ti",
  "Los feos tienen mejor personalidad",
  "El dinero sí compra la felicidad",
  "Todos somos hipócritas",
  "La suegra siempre tiene razón",
  "Los hijos no pedimos nacer",
  "Mejor solo que mal acompañado es mentira",
  "El karma no existe",
  "Las personas atractivas tienen la vida más fácil",
  "Nadie es realmente buena persona"
];

export const CRITERIA = ['LÓGICA', 'RAPIDEZ', 'SÁTIRA'] as const;

export type Criterion = typeof CRITERIA[number];

export function getRandomTopic(exclude?: string): string {
  let topic: string;
  do {
    topic = TOPICS[Math.floor(Math.random() * TOPICS.length)];
  } while (topic === exclude);
  return topic;
}

export function getRandomCriterion(): Criterion {
  return CRITERIA[Math.floor(Math.random() * CRITERIA.length)];
}
