// extensions/hooks/validate-reservation/index.js
export default ({ filter, action }, { services, exceptions, database, getSchema }) => {
  const { InvalidPayloadException } = exceptions;
  
  // Configuración de capacidad por defecto (fallback)
  const CAPACIDAD_DEFAULT = {
    '10:00': 20,
    '10:30': 20,
    '11:00': 20,
    '11:30': 20,
    '12:00': 20,
    '12:30': 20,
    '13:00': 25,
    '13:30': 25,
    '14:00': 30,
    '14:30': 30,
    '15:00': 25,
    '19:00': 25,
    '19:30': 25,
    '20:00': 30,
    '20:30': 30,
    '21:00': 25,
    '21:30': 20,
  };

  // Función para convertir registro de BD a objeto de capacidad
  function convertirRegistroACapacidad(registro) {
    return {
      '10:00': registro.capacidad_10_00 || CAPACIDAD_DEFAULT['10:00'],
      '10:30': registro.capacidad_10_30 || CAPACIDAD_DEFAULT['10:30'],
      '11:00': registro.capacidad_11_00 || CAPACIDAD_DEFAULT['11:00'],
      '11:30': registro.capacidad_11_30 || CAPACIDAD_DEFAULT['11:30'],
      '12:00': registro.capacidad_12_00 || CAPACIDAD_DEFAULT['12:00'],
      '12:30': registro.capacidad_12_30 || CAPACIDAD_DEFAULT['12:30'],
      '13:00': registro.capacidad_13_00 || CAPACIDAD_DEFAULT['13:00'],
      '13:30': registro.capacidad_13_30 || CAPACIDAD_DEFAULT['13:30'],
      '14:00': registro.capacidad_14_00 || CAPACIDAD_DEFAULT['14:00'],
      '14:30': registro.capacidad_14_30 || CAPACIDAD_DEFAULT['14:30'],
      '15:00': registro.capacidad_15_00 || CAPACIDAD_DEFAULT['15:00'],
      '19:00': registro.capacidad_19_00 || CAPACIDAD_DEFAULT['19:00'],
      '19:30': registro.capacidad_19_30 || CAPACIDAD_DEFAULT['19:30'],
      '20:00': registro.capacidad_20_00 || CAPACIDAD_DEFAULT['20:00'],
      '20:30': registro.capacidad_20_30 || CAPACIDAD_DEFAULT['20:30'],
      '21:00': registro.capacidad_21_00 || CAPACIDAD_DEFAULT['21:00'],
      '21:30': registro.capacidad_21_30 || CAPACIDAD_DEFAULT['21:30']
    };
  }

  // Función para obtener la configuración de capacidad para una fecha específica
  async function obtenerConfiguracionCapacidad(fecha, schema) {
    const { ItemsService } = services;
    
    // Crear servicio para configuración de capacidad
    const configService = new ItemsService('configuracion_capacidad', { 
      schema, 
      accountability: { admin: true, role: null } 
    });
    
    // Convertir fecha a objeto Date para obtener día de la semana
    const fechaObj = new Date(fecha);
    const diaSemana = fechaObj.getDay().toString(); // 0=Domingo, 1=Lunes, etc.
    
    console.log(`📅 Fecha: ${fecha}, Día de la semana: ${diaSemana}`);
    
    try {
      // 1. Buscar configuración para fecha específica (prioridad alta)
      const configFechaEspecifica = await configService.readByQuery({
        filter: {
          fecha_especifica: { _eq: fecha },
          activo: { _eq: true }
        },
        fields: ['*'], // Obtener todos los campos
        limit: 1
      });
      
      if (configFechaEspecifica.length > 0) {
        const registro = configFechaEspecifica[0];
        console.log(`🎯 Usando configuración específica para ${fecha}: ${registro.descripcion}`);
        return {
          capacidad: convertirRegistroACapacidad(registro),
          tipo: 'fecha_especifica',
          descripcion: registro.descripcion
        };
      }
      
      // 2. Buscar configuración para día de la semana
      const configDiaSemana = await configService.readByQuery({
        filter: {
          dia_semana: { _eq: diaSemana },
          activo: { _eq: true },
          fecha_especifica: { _null: true } // Solo configuraciones de día de semana
        },
        fields: ['*'], // Obtener todos los campos
        limit: 1
      });
      
      if (configDiaSemana.length > 0) {
        const registro = configDiaSemana[0];
        console.log(`📆 Usando configuración para día de semana ${diaSemana}: ${registro.descripcion}`);
        return {
          capacidad: convertirRegistroACapacidad(registro),
          tipo: 'dia_semana',
          descripcion: registro.descripcion
        };
      }
      
      // 3. Usar configuración por defecto
      console.log('⚙️ Usando configuración por defecto');
      return {
        capacidad: CAPACIDAD_DEFAULT,
        tipo: 'default',
        descripcion: 'Configuración estándar'
      };
      
    } catch (error) {
      console.log('❌ Error al obtener configuración, usando valores por defecto:', error.message);
      return {
        capacidad: CAPACIDAD_DEFAULT,
        tipo: 'default',
        descripcion: 'Configuración estándar (fallback)'
      };
    }
  }

  // Hook que se ejecuta ANTES de crear una reserva
  filter('reservas.items.create', async (input, meta) => {
    const { services, schema, accountability } = meta;
    const { ItemsService } = services;
    
    console.log('🔥🔥🔥 HOOK EJECUTÁNDOSE - VALIDACIÓN DE RESERVAS 🔥🔥🔥');
    console.log('📝 Datos de entrada:', JSON.stringify(input, null, 2));
    
    // Crear servicio con permisos de admin
    const reservasService = new ItemsService('reservas', { 
      schema, 
      accountability: { admin: true, role: null } 
    });
    
    for (const item of input) {
      const { fecha, hora, personas } = item;
      const personasSolicitadas = parseInt(personas || 0);
      
      console.log(`🔎 Validando reserva: ${fecha} ${hora} para ${personasSolicitadas} personas`);
      
      // Validaciones básicas
      if (!fecha || !hora || !personasSolicitadas) {
        console.log('❌ Error: Datos incompletos');
        throw new InvalidPayloadException('Datos de reserva incompletos: fecha, hora y personas son requeridos');
      }
      
      // Obtener configuración de capacidad para esta fecha
      const configCapacidad = await obtenerConfiguracionCapacidad(fecha, schema);
      const CAPACIDAD_MAXIMA = configCapacidad.capacidad;
      
      console.log(`⚙️ Configuración aplicada (${configCapacidad.tipo}): ${configCapacidad.descripcion}`);
      
      if (!CAPACIDAD_MAXIMA[hora]) {
        console.log(`❌ Error: Horario ${hora} no disponible en la configuración actual`);
        throw new InvalidPayloadException(`Horario ${hora} no está disponible para la fecha ${fecha}`);
      }
      
      if (personasSolicitadas <= 0) {
        console.log('❌ Error: Número de personas inválido');
        throw new InvalidPayloadException('Número de personas debe ser mayor a 0');
      }
      
      try {
        // Obtener reservas existentes para este horario (EXCLUYENDO canceladas)
        const reservasExistentes = await reservasService.readByQuery({
          filter: {
            fecha: { _eq: fecha },
            hora: { _eq: hora },
            estado: { _neq: 'cancelada' }
          },
          fields: ['id', 'personas', 'estado'],
          limit: -1
        });
        
        console.log(`📊 Reservas existentes encontradas: ${reservasExistentes.length}`);
        console.log('📋 Detalle de reservas:', JSON.stringify(reservasExistentes, null, 2));
        
        // Calcular personas ya reservadas
        const personasReservadas = reservasExistentes.reduce((total, reserva) => {
          const personas = parseInt(reserva.personas || 0);
          console.log(`   - Reserva ID ${reserva.id}: ${personas} personas (estado: ${reserva.estado})`);
          return total + personas;
        }, 0);
        
        const capacidadMaxima = CAPACIDAD_MAXIMA[hora];
        const espaciosDisponibles = capacidadMaxima - personasReservadas;
        
        console.log(`📈 Capacidad máxima para ${hora}: ${capacidadMaxima} (${configCapacidad.descripcion})`);
        console.log(`👥 Personas ya reservadas: ${personasReservadas}`);
        console.log(`🪑 Espacios disponibles: ${espaciosDisponibles}`);
        console.log(`🎯 Personas solicitadas: ${personasSolicitadas}`);
        
        // VALIDACIÓN CRÍTICA: ¿Hay suficiente espacio?
        if (espaciosDisponibles < personasSolicitadas) {
          const errorMsg = `Capacidad insuficiente para ${fecha}. Solo quedan ${espaciosDisponibles} espacios disponibles para el horario de las ${hora}, pero solicitas ${personasSolicitadas} personas.`;
          console.log(`❌ ${errorMsg}`);
          throw new InvalidPayloadException(errorMsg);
        }
        
        // Si llegamos aquí, la reserva es válida
        console.log(`✅ Reserva válida: ${personasSolicitadas} personas para ${fecha} ${hora} (${configCapacidad.descripcion})`);
        
      } catch (error) {
        console.log('💥 Error al consultar reservas:', error.message);
        
        if (error instanceof InvalidPayloadException) {
          throw error;
        }
        
        throw new InvalidPayloadException('Error al validar disponibilidad: ' + error.message);
      }
    }
    
    console.log('✅ Todas las validaciones pasaron correctamente');
    return input;
  });

  // Hook opcional para logging cuando se crea exitosamente
  action('reservas.items.create', async ({ payload, key, accountability }) => {
    console.log(`🎉 Reserva creada exitosamente: ID ${key}`);
    if (payload && payload.length > 0) {
      const reserva = payload[0];
      console.log(`📅 Detalles: ${reserva.fecha} ${reserva.hora} para ${reserva.personas} personas`);
    }
  });
};