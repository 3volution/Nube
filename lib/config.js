/**
 * Configuración de Estaciones de Carga
 * Guardian 24/7 - Sistema de Monitoreo
 */

export const ESTACIONES = [
  {
    nombre: "Estacion Bus",
    id: 828537,
    direccion: "Av. de la Libertad, Mérida",
    ciudad: "Mérida",
    provincia: "Badajoz"
  },
  {
    nombre: "Avda. Roma",
    id: 828524,
    direccion: "Avda. de Roma, Mérida",
    ciudad: "Mérida",
    provincia: "Badajoz"
  },
  {
    nombre: "Plaza Xirgu",
    id: 828523,
    direccion: "Pl. Margarita Xirgu, Mérida",
    ciudad: "Mérida",
    provincia: "Badajoz"
  },
  {
    nombre: "Calle Almendralejo (1)",
    id: 828534,
    direccion: "C. Almendralejo, Mérida",
    ciudad: "Mérida",
    provincia: "Badajoz"
  },
  {
    nombre: "Calle Almendralejo (2)",
    id: 828535,
    direccion: "C. Almendralejo, Mérida",
    ciudad: "Mérida",
    provincia: "Badajoz"
  },
  {
    nombre: "Avda. del Prado",
    id: 828538,
    direccion: "Avda. del Prado, Mérida",
    ciudad: "Mérida",
    provincia: "Badajoz"
  }
];

export const CONECTORES_STATUS = {
  FREE: "Libre",
  AVAILABLE: "Disponible",
  OCCUPIED: "Ocupado",
  ERROR: "Error",
  UNAVAILABLE: "No disponible"
};

export const LOG_LEVELS = {
  ERROR: "ERROR",
  CAMBIO: "CAMBIO",
  SUCCESS: "SUCCESS",
  INFO: "INFO"
};
