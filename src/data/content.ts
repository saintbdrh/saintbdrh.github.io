/**
 * Every factual statement on the site lives here. Sources: the previous site
 * (git d8d7858, index.html) and the owner's public repositories. Do not add
 * claims that are not traceable to one of those.
 */

export const person = {
  name: 'D. Uuganbadrakh',
  role: 'Electronics Engineer',
  focus: 'Robotics & Intelligent Systems',
  tagline: 'Engineering intelligence into motion.',
  email: 'duuganbadrakh69@gmail.com',
  github: 'https://github.com/saintbdrh',
  location: 'Ulaanbaatar, Mongolia',
  employer: 'Brainstorm Holding',
  education: 'Electronics Engineering, National University of Mongolia',
  department: 'MTES / EHIT Department',
  summary:
    'I work across the whole signal chain, from sensor interface and firmware to control logic and the operator’s dashboard.',
};

/** Scene 02: capabilities, each tied to a mechanism on the model and to real work. */
export const capabilities = [
  {
    id: 'electronics',
    title: 'Electronics',
    anchor: 'A_base',
    part: 'Base drive and connector',
    text: 'Sensor interfaces, relay and motor drivers, safety relays in a stop chain. The hardware layer of the greenhouse, the conveyor line and the ESP32 builds.',
  },
  {
    id: 'embedded',
    title: 'Embedded systems',
    anchor: 'A_shoulder',
    part: 'J2 shoulder actuator',
    text: 'Firmware for ESP32, Arduino and NVIDIA Jetson Nano: non-blocking millis()-based scheduling, ESP-NOW links, Bluetooth A2DP streaming.',
  },
  {
    id: 'robotics',
    title: 'Robotics',
    anchor: 'A_elbow',
    part: 'J3 elbow and forearm',
    text: 'Geometric inverse kinematics and pick-and-place sequencing on a 6-DOF servo arm, plus ROS and MoveIt experience.',
  },
  {
    id: 'vision',
    title: 'Computer vision',
    anchor: 'A_camera',
    part: 'Wrist camera',
    text: 'HSV color segmentation, AprilTag localization, pixel-to-workspace homography, MediaPipe hand tracking, edge and motion detection in OpenCV.',
  },
  {
    id: 'control',
    title: 'Intelligent control',
    anchor: 'A_tool',
    part: 'Tool flange and gripper',
    text: 'Closing the loop from perception to motion, and from detection to shutdown: PLC interlocks backed by an independent vision layer.',
  },
] as const;

/** Scene 03: the thesis pipeline, in signal order. */
export const thesis = {
  title: 'Vision-guided 6-DOF pick-and-place robot',
  context: 'Bachelor’s thesis, National University of Mongolia',
  summary:
    'A color-sorting robot built on a Yahboom DOFBOT arm. The system locates objects in the camera image, maps them into workspace coordinates, and executes each pick-and-place move through geometric inverse kinematics.',
  metric: { value: '2.8 mm', label: 'Mean camera-to-workspace calibration error' },
  repo: 'https://github.com/saintbdrh/Vision-guided-robot-sorting',
  stages: [
    { k: 'Sense', title: 'Intel RealSense D435i', text: 'Color frames of the workspace.' },
    { k: 'Perceive', title: 'HSV segmentation, AprilTag', text: 'Objects segmented by color on the host PC; AprilTag fiducials fix the workspace frame.' },
    { k: 'Map', title: 'Planar homography', text: 'Image pixels mapped to workspace millimetres. Mean calibration error 2.8 mm.' },
    { k: 'Transmit', title: 'TCP/IP, port 5000', text: 'XYZ targets streamed from the laptop to the Jetson, keeping vision apart from motion.' },
    { k: 'Solve', title: 'Geometric IK on Jetson Nano', text: 'Law-of-cosines elbow, two branches, joint limits, pitch fallbacks.' },
    { k: 'Actuate', title: 'Servo joint commands', text: 'Approach, descend, grasp, lift, place, release.' },
  ],
};

export interface Project {
  id: string;
  title: string;
  context: string;
  summary: string;
  problem: string;
  implementation: { b: string; t: string }[];
  stack: string[];
  spec: [string, string][];
  metric?: { value: string; label: string };
  links: { label: string; href: string }[];
  figure: 'homography' | 'gesture' | 'greenhouse' | 'conveyor';
  figureNote: string;
}

export const projects: Project[] = [
  {
    id: 'thesis',
    title: 'Vision-guided robot',
    context: 'Bachelor’s thesis · Robotics, computer vision',
    summary: thesis.summary,
    problem:
      'A camera sees pixels; an arm needs millimetres. The system has to turn a color blob in an image into a reachable, collision-free grasp.',
    implementation: [
      { b: 'Perception.', t: 'HSV thresholding segments target objects by color, AprilTag fiducials fix the workspace reference frame, and a planar homography maps image pixels to workspace coordinates.' },
      { b: 'Communication.', t: 'The host streams XYZ targets to the Jetson over a TCP socket on port 5000, keeping vision processing separate from motion control.' },
      { b: 'Motion.', t: 'The Jetson solves geometric inverse kinematics for each target and drives the arm’s servos through the pick-and-place sequence.' },
      { b: 'Calibration.', t: 'Camera-to-workspace calibration reached a mean error of 2.8 mm.' },
    ],
    stack: ['Python', 'OpenCV', 'AprilTag', 'Intel RealSense D435i', 'NVIDIA Jetson Nano', 'TCP/IP sockets'],
    spec: [
      ['Manipulator', 'Yahboom DOFBOT, 6-DOF servo arm'],
      ['Motion controller', 'NVIDIA Jetson Nano B01'],
      ['Perception host', 'Laptop running Python and OpenCV'],
      ['Vision sensor', 'Intel RealSense D435i'],
      ['Workspace localization', 'AprilTag fiducials, planar homography'],
      ['Kinematics', 'Geometric inverse kinematics'],
      ['Command link', 'TCP/IP socket, port 5000'],
    ],
    metric: thesis.metric,
    links: [
      { label: 'Source on GitHub', href: thesis.repo },
      { label: 'Run the solver in the Lab', href: '#lab' },
    ],
    figure: 'homography',
    figureNote: 'Diagram of the method: AprilTag corners fix a homography from image pixels to the workspace plane.',
  },
  {
    id: 'gesture',
    title: 'Hand-gesture arm control',
    context: 'Robotics, human–machine interface',
    summary:
      'Control of the same Yahboom DOFBOT by hand. MediaPipe tracks the operator’s hand from a laptop camera, and each gesture drives one joint through a receiver running on the Jetson Nano.',
    problem:
      'Six joints, one hand. The mapping has to be distinct enough that a tracker never confuses two commands.',
    implementation: [
      { b: 'Tracking.', t: 'MediaPipe hand landmarks are computed on the laptop with OpenCV capture.' },
      { b: 'Mapping.', t: 'Hand left/right rotates the base. Thumb–index, thumb–middle and thumb–ring pinches move shoulder, elbow and wrist. Thumb–pinky touch and release open and close the gripper.' },
      { b: 'Execution.', t: 'A receiver on the Jetson Nano applies the commands through the DOFBOT arm library.' },
    ],
    stack: ['Python', 'MediaPipe 0.10.9', 'OpenCV', 'NumPy', 'NVIDIA Jetson Nano', 'Yahboom Arm_Lib'],
    spec: [
      ['Manipulator', 'Yahboom DOFBOT'],
      ['Tracking', 'MediaPipe hand landmarks, laptop camera'],
      ['Controller', 'NVIDIA Jetson Nano, gesture receiver'],
      ['Gestures', 'Lateral hand position, four thumb contacts'],
    ],
    links: [{ label: 'Source on GitHub', href: 'https://github.com/saintbdrh/dofbot-hand-gesture-control' }],
    figure: 'gesture',
    figureNote: 'Gesture-to-joint map from the project README. Hand drawn as the 21-point MediaPipe landmark model.',
  },
  {
    id: 'greenhouse',
    title: 'Smart greenhouse',
    context: 'IoT, agriculture',
    summary:
      'A two-node wireless system for greenhouse automation. A field node handles sensing and actuation inside the greenhouse; a control hub runs the control logic, serves the dashboard and sends alerts.',
    problem:
      'Sensors and relays live in a humid greenhouse; the operator does not. Readings and commands have to cross that gap reliably and raise an alarm when a threshold is breached.',
    implementation: [
      { b: 'Field node.', t: 'ESP32 #2 samples air temperature and humidity (DHT22), light level (LDR) and soil moisture, and switches fans, pumps and grow lights through relay outputs.' },
      { b: 'Wireless link.', t: 'Node and hub exchange readings and commands over ESP-NOW, Espressif’s low-latency, connectionless peer-to-peer protocol.' },
      { b: 'Control hub.', t: 'ESP32 #1 runs the system logic and serves an HTML/CSS/JavaScript dashboard over Wi-Fi.' },
      { b: 'Alerting.', t: 'A Telegram bot notifies operators as soon as a reading breaches its threshold.' },
    ],
    stack: ['ESP32', 'ESP-NOW', 'DHT22', 'LDR', 'Soil moisture sensor', 'Relay modules', 'HTML/CSS/JavaScript', 'Telegram Bot API'],
    spec: [
      ['Architecture', 'Two ESP32 nodes: field node and control hub'],
      ['Wireless link', 'ESP-NOW, peer-to-peer'],
      ['Sensors', 'DHT22, LDR, soil moisture probe'],
      ['Actuators', 'Relay-driven fans, pumps, grow lights'],
      ['Operator interface', 'Web dashboard served by the hub over Wi-Fi'],
      ['Alerting', 'Telegram bot, triggered on threshold breach'],
    ],
    metric: { value: '4', label: 'Monitored quantities: temperature, humidity, light, soil moisture' },
    links: [],
    figure: 'greenhouse',
    figureNote: 'System diagram. Sensor positions are schematic; no live readings are shown.',
  },
  {
    id: 'conveyor',
    title: 'Conveyor safety system',
    context: 'Industrial automation, machine safety',
    summary:
      'Conveyor monitoring that combines PLC-based hardware interlocks with a computer-vision detection layer. Either layer can shut the conveyor down.',
    problem:
      'A single safety path is a single point of failure. The line needs two independent ways to see a hazard and stop.',
    implementation: [
      { b: 'Control and interlocks.', t: 'A Siemens S7-1200 PLC, programmed in TIA Portal with ladder logic, manages emergency-stop logic, motor control and the light curtains, with safety relays in the stop chain.' },
      { b: 'Vision layer.', t: 'A parallel OpenCV pipeline on an embedded industrial PC detects human proximity, foreign-object intrusion and belt misalignment using edge detection and motion analysis.' },
      { b: 'Redundancy.', t: 'The two layers operate independently, so a fault detected by either one shuts the conveyor down.' },
      { b: 'Operator interface.', t: 'An HMI panel shows live system status and keeps an event log.' },
    ],
    stack: ['Siemens S7-1200', 'TIA Portal', 'Ladder logic', 'HMI', 'Safety relays', 'Python', 'OpenCV'],
    spec: [
      ['Controller', 'Siemens S7-1200 PLC'],
      ['Programming', 'TIA Portal, ladder logic'],
      ['Safety devices', 'Emergency stop, light curtains, safety relays'],
      ['Vision platform', 'Python and OpenCV on an embedded industrial PC'],
      ['Detected conditions', 'Human proximity, foreign-object intrusion, belt misalignment'],
      ['Architecture', 'Dual-redundant: PLC interlocks and vision layer'],
    ],
    metric: { value: '< 50 ms', label: 'Emergency-stop response' },
    links: [],
    figure: 'conveyor',
    figureNote: 'Architecture diagram: either lane can open the stop chain.',
  },
];

export const builds = [
  {
    id: 'b-bin',
    title: 'Smart waste bin controller',
    text: 'ESP32 firmware for touchless lid actuation using ultrasonic proximity sensing, plus capacitive touch input on GPIO. Tasks run on non-blocking, millis()-based scheduling instead of delay() calls; notifications go out through the Telegram Bot API.',
    stack: 'ESP32, C++, Telegram Bot API',
  },
  {
    id: 'b-audio',
    title: 'Bluetooth A2DP audio player',
    text: 'Streams raw PCM audio from an SD card over Bluetooth A2DP on the ESP32, with real-time buffering and playback control.',
    stack: 'ESP32, Bluetooth A2DP, C++, SD card',
  },
  {
    id: 'b-oled',
    title: 'Meeting room schedule display',
    text: 'A Flask backend authenticates to the Google Calendar API through OAuth 2.0 and pushes live room bookings to an Arduino-driven OLED display, which parses the JSON payload with ArduinoJson.',
    stack: 'Python, Flask, Google Calendar API, OAuth 2.0, Arduino, ArduinoJson, OLED',
  },
];

/** Capability map: skill -> project ids (p1..p7). */
export const parts = [
  { id: 'p1', label: 'Vision-guided robot', href: '#thesis' },
  { id: 'p7', label: 'Hand-gesture arm control', href: '#gesture' },
  { id: 'p2', label: 'Smart greenhouse', href: '#greenhouse' },
  { id: 'p3', label: 'Conveyor safety system', href: '#conveyor' },
  { id: 'p4', label: 'Smart waste bin controller', href: '#b-bin' },
  { id: 'p5', label: 'Bluetooth A2DP audio player', href: '#b-audio' },
  { id: 'p6', label: 'Meeting room display', href: '#b-oled' },
];

export const domains = [
  {
    title: 'Robotics and vision',
    skills: [
      ['Inverse kinematics', 'p1'],
      ['Pick-and-place automation', 'p1'],
      ['OpenCV', 'p1 p3 p7'],
      ['HSV color segmentation', 'p1'],
      ['AprilTag localization', 'p1'],
      ['Homography', 'p1'],
      ['MediaPipe hand tracking', 'p7'],
      ['Edge and motion detection', 'p3'],
      ['Intel RealSense D435i', 'p1'],
    ],
  },
  {
    title: 'Embedded systems',
    skills: [
      ['ESP32', 'p2 p4 p5'],
      ['Arduino', 'p6'],
      ['NVIDIA Jetson Nano', 'p1 p7'],
      ['C/C++ firmware', 'p4 p5'],
      ['Non-blocking scheduling', 'p4'],
      ['Sensor interfacing', 'p2 p4'],
      ['Relay and motor control', 'p2 p3'],
    ],
  },
  {
    title: 'Industrial automation',
    skills: [
      ['Siemens S7-1200', 'p3'],
      ['TIA Portal, ladder logic', 'p3'],
      ['HMI', 'p3'],
      ['Safety interlocks and relays', 'p3'],
    ],
  },
  {
    title: 'Connectivity and software',
    skills: [
      ['ESP-NOW', 'p2'],
      ['TCP/IP sockets', 'p1'],
      ['Bluetooth A2DP', 'p5'],
      ['Wi-Fi web dashboards', 'p2'],
      ['Telegram Bot API', 'p2 p4'],
      ['Python', 'p1 p3 p6 p7'],
      ['Flask', 'p6'],
      ['Google OAuth 2.0', 'p6'],
    ],
  },
] as const;

export const alsoExperienced =
  'ROS, MoveIt, Zephyr RTOS, LoRa, MQTT, Raspberry Pi, Verilog and VHDL for FPGA design, and CTF security practice on TryHackMe, Hack The Box and picoCTF.';

export const profile = {
  statement: [
    'I’m an electronics engineer at Brainstorm Holding and a graduate of the National University of Mongolia, where my bachelor’s thesis delivered a vision-guided robotic arm system.',
    'My work sits where embedded hardware meets intelligent software: bare-metal firmware, RTL in Verilog, computer vision pipelines and inverse kinematics for physical robot arms. I design across the whole signal chain, from the sensor interface to the operator’s dashboard.',
    'Outside engineering, I have worked as a tour guide and operations manager and completed mandatory military service. Both sharpened how I communicate, plan and stay composed under pressure.',
  ],
  future:
    'I’m looking for roles in embedded systems, robotics and automation, or IoT engineering, building equipment that is dependable in service and genuinely useful. Drone systems and open-source robotics are where my curiosity is heading next.',
  education: [
    ['Electronics Engineering', 'National University of Mongolia, MTES / EHIT Department'],
    ['Bachelor’s thesis', 'Vision-guided 6-DOF pick-and-place robot'],
  ],
  experience: [
    ['Electronics Engineer', 'Brainstorm Holding, current'],
    ['Tour guide and operations manager', 'Tourism'],
    ['Military service', 'Mandatory service, completed'],
  ],
  languages: [
    ['Mongolian', 'Native', 4],
    ['English', 'Professional working proficiency', 3],
    ['Russian', 'Conversational', 2],
  ] as [string, string, number][],
  interests: ['Drone systems', 'Open-source robotics', 'OSINT and ethical hacking'],
};
