

import type { Schema } from './types';

export const DEFAULT_SCHEMA: Schema = {
  meta: {
    id: 'DeepTimeLabelSet-v0.9.0',
    purpose: 'LLM-driven KG extraction from scientific papers: evidence-anchored, audit-ready. Optimized for entity & relationship extraction in deep-time research with a typed ontology.',
  },
  predicates: {
    predicateCategories: {
      "Taxonomic & Definitional": [
        'definesBy', 'expandsTo', 'inRealm', 'hasSystemType', 'hasDomain', 'hasDepositionalElement', 'hasMorphoformScale', 'partOf', 'equivalentTo', 'distinguishes', 'indistinguishableFrom', 'hasPart'
      ],
      "Stratigraphic & Spatial": [
        'overlies', 'underlies', 'lateralEquivalentOf', 'timeEquivalentOf', 'correlativeTo', 'contains', 'locatedIn', 'occursIn', 'occursOn', 'absentFrom',
      ],
      "Evidential & Interpretive": [
        'hasEvidence', 'impliesOrigin', 'consistentWith', 'indicativeOf', 'notIndicativeOf', 'depositedIn', 'derivedFrom', 'reconstructedFrom',
      ],
      "Sampling & Analysis": [
         'containsFossil', 'belongsToUnit', 'sampledAt', 'collectedFrom', 'curatedBy', 'analyzedBy', 'usesMethod',
      ],
      "Property & Measurement": [
        'hasProperty', 'hasAge', 'hasAgeModel', 'hasTiePoint', 'hasThickness', 'hasDepthTop_m', 'hasDepthBase_m', 'hasHeight_m', 'hasPaleolatitude', 'hasPaleolongitude', 'hasTimeDepth', 'hasVelocity',
      ],
      "Provenance & Claims": [
        'reports', 'mentions', 'supports', 'refutes', 'correlatesWith', 'assignedToBiozone', 'assignedToMagnetochron', 'assignedToSequenceStrat'
      ]
    },
    definitions: {
        partOf: {
            description: "Hierarchical membership for time, space, or stratigraphy. The subject is a component of the object.",
            domain: ["GeologicTimeUnitNamed", "Location", "LithostratigraphicUnit", "ChronostratigraphicUnit", "DepositionalElement", "Member", "Stage"],
            range: ["GeologicTimeUnitNamed", "Location", "LithostratigraphicUnit", "ChronostratigraphicUnit", "FluvialDomain", "Formation", "Series", "System"],
        },
        hasPart: {
            description: "Inverse of partOf. The subject contains the object as a component.",
            domain: ["GeologicTimeUnitNamed", "Location", "LithostratigraphicUnit", "ChronostratigraphicUnit", "FluvialDomain", "Formation", "Series", "System"],
            range: ["GeologicTimeUnitNamed", "Location", "LithostratigraphicUnit", "ChronostratigraphicUnit", "DepositionalElement", "Member", "Stage"],
        },
        locatedIn: {
            description: "Specifies that the subject is geographically located within the object. For spatial containment only.",
            domain: ["Location", "GeologicObject", "GeologicUnit", "OutcropSection", "WellBorehole", "Basin", "Formation"],
            range: ["Location", "Basin"],
        },
        contains: {
            description: "Specifies that the subject geographically contains the object. The inverse of locatedIn. Use for spatial relationships, not for properties or components.",
            domain: ["Location", "Basin"],
            range: ["Location", "GeologicObject", "GeologicUnit", "OutcropSection", "WellBorehole", "Basin", "Formation"],
        },
        hasAge: {
            description: "Assigns a geologic time unit or absolute age to a geologic feature or event.",
            domain: ["GeologicUnit", "RockObject", "GeologicFeatureMorphologic", "Events", "Location", "Formation"],
            range: ["GeologicTimeUnitNamed", "AbsoluteAgeValue", "System", "Series", "Stage"],
        },
        timeEquivalentOf: {
            description: "Indicates that two geologic units or time intervals are of the same age, though they may differ in other properties. Use for explicit statements of equivalence.",
            domain: ["GeologicTimeUnitNamed", "ChronostratigraphicUnit"],
            range: ["GeologicTimeUnitNamed", "ChronostratigraphicUnit"],
        },
        correlatesWith: {
            description: "Indicates a correspondence or relationship in properties or timing between two distinct geologic entities, often in different locations. Symmetric relation.",
            domain: ["GeologicUnit", "GeologicObject", "Location", "Events"],
            range: ["GeologicUnit", "GeologicObject", "Location", "Events"],
        },
        hasSystemType: {
            description: "Assigns a classification or system type to an entity.",
            domain: ["DepositionalEnvironment", "FluvialSystemType", "GeologicUnit", "Location"],
            range: ["FluvialSystemType", "TectonicSetting", "RockOrigin", "GISFeature"],
        },
        depositedIn: {
            description: "Specifies the depositional environment or realm for a geologic unit.",
            domain: ["GeologicUnit", "RockObject"],
            range: ["DepositionalEnvironment", "Realm", "EnvironmentsSystems"],
        },
        hasProperty: {
            description: "Assigns a quality, attribute, or lithology to an entity.",
            domain: ["GeologicUnit", "RockObject", "Location"],
            range: ["DescriptorAtoms", "RockOrigin", "Lithology"],
        },
         hasDomain: {
            description: "Specifies the environmental domain (e.g., Continental, Marine) of a system or unit.",
            domain: ["FluvialSystemType", "GeologicUnit"],
            range: ["Realm", "Continental", "Marine"],
        },
        occursIn: {
            description: "Denotes the presence of a feature, process, or substance within a location or unit.",
            domain: ["GeologicFeatureMorphologic", "Events", "RockOrigin"],
            range: ["Location", "Realm", "DepositionalEnvironment", "GeologicUnit"],
        },
    },
    alias_map: {
      occursIn: ['occurs at', 'occur at', 'occurs in', 'occur in', 'occurred in', 'develop in', 'developed in', 'developed at', 'developed on', 'presented as', 'concentrated in', 'mainly in', 'extended from', 'ranged from', 'reached'],
      occursOn: ['occurs on'],
      locatedIn: ['located in', 'is in', 'located below'],
      contains: ['includes', 'included', 'comprises', 'composed of', 'contained', 'set of'],
      partOf: ['included in', 'forms part of'],
      correlativeTo: ['coincide with', 'overlapped with', 'linked together through'],
      equivalentTo: ['equivalent', 'defined as'],
      indicativeOf: ['indicates', 'indicate', 'reflects'],
      notIndicativeOf: ['cannot indicate', 'is not'],
      distinguishes: ['used to distinguish', 'mainly used to distinguish', 'required to effectively identify', 'can be distinguished with'],
      indistinguishableFrom: ['indistinguishable', 'cannot distinguish', 'unable to distinguish'],
      absentFrom: ['not present in', 'not formed yet at'],
      depositedIn: ['deposited in', 'deposited at'],
      derivedFrom: ['derived from', 'came from', 'source area', 'transported through'],
      reconstructedFrom: ['reconstruct', 'reconstructed using', 'reconstructed through', 'determined according to', 'confirmed via'],
      usesMethod: ['used to describe', 'described with', 'use only'],
      supports: ['supports', 'improves', 'enhances', 'provides', 'valuable for'],
      refutes: ['refutes', 'contradicts', 'is not'],
      hasProperty: ['has', 'has the potential to'],
    }
  },
  observableAxis: {
    Time: { concepts: ['AbsoluteAgeValue', 'GeologicTimeUnitNamed'] },
    Space: { concepts: ['Location', 'Geometry', 'CRS'] },
    GeologicObject: { concepts: ['RockObject', 'Specimen', 'Sample', 'WellBorehole', 'Core', 'OutcropSection', 'SeismicSectionCube'] },
    GeologicUnit: { concepts: [{ LithostratigraphicUnit: ['Supergroup', 'Group', 'Formation', 'Member', 'Bed'] }, { ChronostratigraphicUnit: ['System', 'Series', 'Stage'] }] },
    GeologicFeatureMorphologic: { concepts: ['FaultMorphologic', 'FoldMorphologic', 'ContactMorphologic', 'BoundingSurfaceMorphology'] },
    ObservationalRecord: { concepts: ['WellLogCurve', 'SeismicToken', 'ImageSegment', 'ThinSectionObservation', 'AssayMeasurement', 'RadiometricDateMeasurement', 'MagnetostratRecord', 'ChemostratTiePoint', 'PaleomagDirection', 'GISFeature'] },
    DescriptorAtoms: { concepts: ['GrainSize', 'Sorting', 'Roundness', 'BedThickness', 'FabricSupport', 'MatrixType', 'CementType', 'CarbonateComponent', 'CrystalSizeClass', 'FabricPlanarity', 'LineationPresence', 'LaminationType', 'SedimentaryStructure', 'SetGeometry', 'StructurePresence'] },
    ObservationPattern: { concepts: ['CrossStratificationPattern', 'HCSPattern', 'IgneousTexturePattern', 'MetamorphicFabricPattern', 'MagnetostratPattern'] },
  },
  interpretiveAxis: {
    Realm: { concepts: ['Continental', 'Transitional', 'Marine'] },
    EnvironmentsSystems: {
      concepts: {
        DepositionalEnvironment: ['Fluvial', 'Deltaic', 'Eolian', 'Lacustrine', 'Shelf', 'Slope', 'DeepMarine', 'CarbonatePlatformRamp'],
        FluvialSystemType: ['Meandering', 'Braided', 'Anastomosing', 'Straight', 'Ephemeral'],
        FluvialDomain: ['ChannelBelt', 'FloodplainOverbank'],
        DepositionalElement: {
          ChannelBelt: ['Channel', 'BarForm', 'LateralAccretionPackage', 'ChannelFill'],
          FloodplainOverbank: ['Levee', 'CrevasseSplay_Proximal', 'CrevasseSplay_Distal', 'OverbankSandSheet', 'FloodplainFine', 'Paleosol', 'OxbowLakeFill', 'AvulsionDeposit']
        },
        SequenceStratElement: ['LST', 'TST', 'HST', 'FSST', 'SequenceBoundary'],
        TectonicSetting: ['ForelandBasin', 'Rift', 'PassiveMargin', 'Basin'],
      }
    },
    RockOrigin: { concepts: ['Sedimentary', 'Igneous', 'Metamorphic', 'Lithology'] },
    ClassAssignments: { concepts: ['PetrographicRockName', 'LithofaciesClass', 'ElectrofaciesClass', 'MicrofaciesClass', 'CrossStratificationType'] },
    Biostratigraphy: { concepts: ['Taxon', 'Biozone', 'IndexFossil'] },
    Chronology: { concepts: ['AgeModel', 'TiePoint'] },
    SurfacesInterpretive: { concepts: ['Unconformity', 'ScourSurface', 'ChannelBase', 'SequenceBoundary'] },
    Events: { concepts: ['Orogeny', 'ImpactEvent', 'VolcanicEruption', 'Earthquake', 'Transgression', 'Regression'] },
    Attributes: { concepts: { MorphoformScale: ['Microform', 'Mesoform', 'Macroform'] } }
  },
  relations: {
    'inRealm': 'DepositionalEnvironment -> Realm',
    'hasSystemType': 'DepositionalEnvironment -> FluvialSystemType',
    'hasDomain': 'FluvialSystemType -> FluvialDomain',
    'hasDepositionalElement': 'FluvialDomain -> DepositionalElement',
    'partOf': 'DepositionalElement -> FluvialDomain',
    'occursIn': 'Object|Unit|Event -> Location|Realm|DepositionalEnvironment',
    'overlies': 'Unit|Surface -> Unit|Surface',
    'definesBy': 'PetrographicRockName|LithofaciesClass -> DescriptorAtoms[]|ObservationPattern|DescriptorBundle',
    'hasEvidence': 'Interpretive -> Observable',
    'indicativeOf': 'Observable|ClassAssignment <-> Environment|Domain|Element',
    'depositedIn': 'Deposit|Unit -> DepositionalEnvironment|Element'
  }
};