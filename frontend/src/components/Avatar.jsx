import { useEffect, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
// Unused utils removed to prevent confusion
// import { textToVisemes, textToVisemesAPI, textToAudioVisemesAPI, getVisemeMorphTargets } from "../utils/visemeUtils";
import { speakText, stopSpeaking } from "../utils/ttsUtils";
import { useLipSync } from "../hooks/useLipSync";
import { clampMorphInfluence } from "../utils/morphUtils";

function Avatar({ model, handpos, ischatting, text, speakTrigger, onSpeechStart, emotions, ismale }) {
    const { scene } = useGLTF(model);
    const groupRef = useRef();
    const avtargroup = useRef()
    const rightArm = useRef(null);
    const leftArm = useRef(null);
    const rightForeArm = useRef(null);
    const leftForeArm = useRef(null);
    const leftHand = useRef(null);
    const rightHand = useRef(null);
    const head = useRef(null);
    const spine = useRef(null);
    const meshes = useRef([]);
    const time = useRef(0);
    const leftindex4 = useRef(null);
    const leftmiddle4 = useRef(null);
    const leftring4 = useRef(null);
    const leftpinky4 = useRef(null);
    const headResetDone = useRef(false);
    const headTransitionTime = useRef(0);
    const headStartRot = useRef({ x: 0, y: 0, z: 0 });

    // Arm repositioning refs
    const armResetDone = useRef(false);
    const armTransitionTime = useRef(0);
    const armStartRot = useRef({
        rightArm: { x: 0, y: 0, z: 0 },
        leftArm: { x: 0, y: 0, z: 0 },
        rightForeArm: { x: 0, y: 0, z: 0 },
        leftForeArm: { x: 0, y: 0, z: 0 }
    });


    const rightindex4 = useRef(null);
    const rightmiddle4 = useRef(null);
    const rightring4 = useRef(null);
    const rightpinky4 = useRef(null);

    // Transition system refs
    const transitionTime = useRef(0);
    const isTransitioning = useRef(false);
    const transitionStartRotations = useRef({ right: {}, left: {} });

    // List of Bone Points names can be used for animation
    const bones = [
        "Spine",
        "Spine1",
        "Spine2",
        "Neck",
        "Head",
        "HeadTop_End",
        "LeftEye",
        "RightEye",

        "LeftShoulder",
        "LeftArm",
        "LeftForeArm",
        "LeftHand",
        "LeftHandThumb1",
        "LeftHandThumb2",
        "LeftHandThumb3",
        "LeftHandThumb4",
        "LeftHandIndex1",
        "LeftHandIndex2",
        "LeftHandIndex3",
        "LeftHandIndex4",
        "LeftHandMiddle1",
        "LeftHandMiddle2",
        "LeftHandMiddle3",
        "LeftHandMiddle4",
        "LeftHandRing1",
        "LeftHandRing2",
        "LeftHandRing3",
        "LeftHandRing4",
        "LeftHandPinky1",
        "LeftHandPinky2",
        "LeftHandPinky3",
        "LeftHandPinky4",

        "RightShoulder",
        "RightArm",
        "RightForeArm",
        "RightHand",
        "RightHandThumb1",
        "RightHandThumb2",
        "RightHandThumb3",
        "RightHandThumb4",
        "RightHandIndex1",
        "RightHandIndex2",
        "RightHandIndex3",
        "RightHandIndex4",
        "RightHandMiddle1",
        "RightHandMiddle2",
        "RightHandMiddle3",
        "RightHandMiddle4",
        "RightHandRing1",
        "RightHandRing2",
        "RightHandRing3",
        "RightHandRing4",
        "RightHandPinky1",
        "RightHandPinky2",
        "RightHandPinky3",
        "RightHandPinky4",

        "LeftUpLeg",
        "LeftLeg",
        "LeftFoot",
        "LeftToeBase",
        "LeftToe_End",

        "RightUpLeg",
        "RightLeg",
        "RightFoot",
        "RightToeBase",
        "RightToe_End"
    ];

    // List of mesh points names can be used for animation 
    const mesh = [
        "Scene",
        "Armature",
        "EyeLeft",
        "EyeRight",
        "Wolf3D_Body",
        "Wolf3D_Glasses",
        "Wolf3D_Hair",
        "Wolf3D_Head",
        "Wolf3D_Outfit_Bottom",
        "Wolf3D_Outfit_Footwear",
        "Wolf3D_Outfit_Top",
        "Wolf3D_Teeth",

        "Hips",
        "Spine",
        "Spine1",
        "Spine2",
        "Neck",
        "Head",
        "HeadTop_End",

        "LeftEye",
        "RightEye",

        "LeftShoulder",
        "LeftArm",
        "LeftForeArm",
        "LeftHand",
        "LeftHandThumb1",
        "LeftHandThumb2",
        "LeftHandThumb3",
        "LeftHandThumb4",
        "LeftHandIndex1",
        "LeftHandIndex2",
        "LeftHandIndex3",
        "LeftHandIndex4",
        "LeftHandMiddle1",
        "LeftHandMiddle2",
        "LeftHandMiddle3",
        "LeftHandMiddle4",
        "LeftHandRing1",
        "LeftHandRing2",
        "LeftHandRing3",
        "LeftHandRing4",
        "LeftHandPinky1",
        "LeftHandPinky2",
        "LeftHandPinky3",
        "LeftHandPinky4",

        "RightShoulder",
        "RightArm",
        "RightForeArm",
        "RightHand",
        "RightHandThumb1",
        "RightHandThumb2",
        "RightHandThumb3",
        "RightHandThumb4",
        "RightHandIndex1",
        "RightHandIndex2",
        "RightHandIndex3",
        "RightHandIndex4",
        "RightHandMiddle1",
        "RightHandMiddle2",
        "RightHandMiddle3",
        "RightHandMiddle4",
        "RightHandRing1",
        "RightHandRing2",
        "RightHandRing3",
        "RightHandRing4",
        "RightHandPinky1",
        "RightHandPinky2",
        "RightHandPinky3",
        "RightHandPinky4",

        "LeftUpLeg",
        "LeftLeg",
        "LeftFoot",
        "LeftToeBase",
        "LeftToe_End",

        "RightUpLeg",
        "RightLeg",
        "RightFoot",
        "RightToeBase",
        "RightToe_End",

        "neutral_bone"
    ];


    const headMesh = useRef(null);
    const teethMesh = useRef(null);
    const eyelidright = useRef(null);
    const eyelidleft = useRef(null);

    // ============================================
    // VISEME LIP SYNC STATE (NEW SYSTEM)
    // ============================================
    // Hook handles audio playback, timeline, and frame updates
    const { speak, stop: stopLipSync, isPlaying: isLipSyncing } = useLipSync(headMesh, teethMesh, onSpeechStart);

    // Legacy flags maintained for compatibility with other effects
    const [isPlayingVisemes, setIsPlayingVisemes] = useState(false);

    useEffect(() => {
        setIsPlayingVisemes(isLipSyncing);
    }, [isLipSyncing]);

    const eyeLidBone = useRef(null);
    const blinkTime = useRef(0);
    const nextBlinkTime = useRef(Math.random() * 0 + 2); // First blink in 2-5 seconds

    // Emotion system
    const leftEye = useRef(null);
    const rightEye = useRef(null);
    const thinkingTime = useRef(0);
    const thinkingPhase = useRef(0); // 0: idle, 1: moving, 2: holding, 3: returning

    // Emotion configurations
    const emotionConfigs = {
        happy: {
            gestureAmplitude: 1.3,
            gestureSpeed: 1.2,
            headTilt: 0.05,
            headNodSpeed: 1.0,
            smileIntensity: 1
        },
        sad: {
            gestureAmplitude: 0.5,
            gestureSpeed: 0.6,
            headTilt: 0.1,
            headNodSpeed: 0.5,
            smileIntensity: -2
        },
        neutral: {
            gestureAmplitude: 1.0,
            gestureSpeed: 1.0,
            headTilt: 0,
            headNodSpeed: 0.8,
            smileIntensity: 0
        },
        explain1: {
            gestureAmplitude: 0.7,
            gestureSpeed: 0.9,
            headTilt: 0,
            headNodSpeed: 0.8,
            smileIntensity: 0,
            armFoldAngle: Math.PI / 4, // 45 degrees
            customHandPath: true // Enable custom path animation
        },
        explain2: {
            gestureAmplitude: 1.5,
            gestureSpeed: 1.3,
            headTilt: 0,
            headNodSpeed: 1.0,
            smileIntensity: 0,
            armFoldAngle: Math.PI / 2, // 90 degrees
            customHandPath: true // Enable custom path animation
        },
        listen: {
            gestureAmplitude: 0.3,
            gestureSpeed: 0.5,
            headTilt: 0,
            headNodSpeed: 2.0, // Faster nodding
            nodAmplitude: 0.08, // Larger nods
            smileIntensity: 0
        },
        think: {
            gestureAmplitude: 0.4,
            gestureSpeed: 0.6,
            headTilt: 0.1,
            headNodSpeed: 0.3,
            smileIntensity: 0,
            eyeRoll: true
        }
    };

    const currentEmotion = emotionConfigs[emotions?.toLowerCase()] || emotionConfigs.neutral;
    const prevEmotion = useRef(emotions);

    // Trigger transition when emotion changes
    useEffect(() => {
        if (prevEmotion.current !== emotions) {
            // Emotion changed - trigger transition
            currentEmotion.gestureReset = 1;
            prevEmotion.current = emotions;
            // Reset head and arm transition flags for ALL emotion changes
            headResetDone.current = false;
            headTransitionTime.current = 0;
            armResetDone.current = false;
            armTransitionTime.current = 0;
        }
    }, [emotions, currentEmotion]);

    useEffect(() => {
        scene.traverse((obj) => {
            if (obj.isMesh) {
                console.log("Mesh: ", obj.name)
            }
            if (obj.isBone) {
                console.log("Bone: ", obj.name)
            }
            if (obj.isMesh && obj.morphTargetDictionary) {

                if (obj.name === "Wolf3D_Head") {
                    headMesh.current = obj;
                    // obj.visible = false;
                }
                if (obj.name === "Wolf3D_Teeth") {
                    teethMesh.current = obj;
                }
            }
            // Capture the specific bone for eyelids
            if (obj.isBone && obj.name === "EyeLids") {
                eyeLidBone.current = obj;
                console.log("✅ Found EyeLids bone for blinking animation");
            }
            // Capture eye bones for thinking animation (prioritize bones over meshes)
            if (obj.isBone && obj.name === "LeftEye") {
                leftEye.current = obj;
                console.log("✅ Found LeftEye bone for eye roll");
            }
            if (obj.isBone && obj.name === "RightEye") {
                rightEye.current = obj;
                console.log("✅ Found RightEye bone for eye roll");
            }
            if (obj.isBone && obj.name === "RightHandIndex4") {
                rightindex4.current = obj;
            }
            if (obj.isBone && obj.name === "RightHandMiddle4") {
                rightmiddle4.current = obj;
            }
            if (obj.isBone && obj.name === "RightHandRing4") {
                rightring4.current = obj;
            }
            if (obj.isBone && obj.name === "RightHandPinky4") {
                rightpinky4.current = obj;
            }
            if (obj.isBone && obj.name === "LeftHandIndex4") {
                leftindex4.current = obj;
            }
            if (obj.isBone && obj.name === "LeftHandMiddle4") {
                leftmiddle4.current = obj;
            }
            if (obj.isBone && obj.name === "LeftHandRing4") {
                leftring4.current = obj;
            }
            if (obj.isBone && obj.name === "LeftHandPinky4") {
                leftpinky4.current = obj;
            }
        });

        // Verify what we captured after traversal
        console.log("Eye capture verification:", {
            leftEye: leftEye.current ? leftEye.current.name : "NOT FOUND",
            rightEye: rightEye.current ? rightEye.current.name : "NOT FOUND"
        });
    }, [scene]);

    // ============================================
    // BLINK ANIMATION (Using Shape Key)
    // ============================================
    useFrame((state, delta) => {
        if (!headMesh.current) return;

        blinkTime.current += delta;

        if (blinkTime.current >= nextBlinkTime.current) {
            const blinkDuration = 0.15; // Quick blink
            const timeSinceBlinkStart = blinkTime.current - nextBlinkTime.current;

            if (timeSinceBlinkStart <= blinkDuration) {
                // Smooth blink animation using sine wave
                const blinkProgress = timeSinceBlinkStart / blinkDuration;
                const blinkValue = Math.sin(blinkProgress * Math.PI); // 0 -> 1 -> 0

                // Apply to blink shape key
                const hDict = headMesh.current.morphTargetDictionary;
                const hInfl = headMesh.current.morphTargetInfluences;

                // Debug: Check if blink shape key exists (log once)
                if (!window.blinkShapeKeyChecked) {
                    if (hDict.blink !== undefined) {
                        console.log("✅ Blink shape key found at index:", hDict.blink);
                    } else {
                        console.log("❌ Blink shape key NOT found. Available keys:", Object.keys(hDict));
                    }
                    window.blinkShapeKeyChecked = true;
                }

                if (hDict.blink !== undefined) {
                    hInfl[hDict.blink] = clampMorphInfluence(blinkValue);
                }

                // Also apply to teeth if it has the shape key
                if (teethMesh.current) {
                    const tDict = teethMesh.current.morphTargetDictionary;
                    const tInfl = teethMesh.current.morphTargetInfluences;
                    if (tDict.blink !== undefined) {
                        tInfl[tDict.blink] = clampMorphInfluence(blinkValue);
                    }
                }
            } else {
                // Blink finished - reset shape key to 0
                const hDict = headMesh.current.morphTargetDictionary;
                const hInfl = headMesh.current.morphTargetInfluences;

                if (hDict.blink !== undefined) {
                    hInfl[hDict.blink] = 0;
                }

                if (teethMesh.current) {
                    const tDict = teethMesh.current.morphTargetDictionary;
                    const tInfl = teethMesh.current.morphTargetInfluences;
                    if (tDict.blink !== undefined) {
                        tInfl[tDict.blink] = 0;
                    }
                }

                blinkTime.current = 0;
                nextBlinkTime.current = Math.random() * 3 + 2; // Next blink in 2-5s
            }
        }
    });

    // ============================================
    // TEXT TO VISEME CONVERSION + AUDIO PLAYBACK
    // ============================================
    // This effect runs when the speakTrigger changes (when user clicks Speak button)
    // It converts the text into a timed sequence of viseme shapes AND plays audio
    // ============================================
    // TEXT/AUDIO TO VISEME CONVERSION + PLAYBACK
    // ============================================
    // ============================================
    // TEXT TO VISEME CONVERSION + AUDIO PLAYBACK
    // ============================================
    useEffect(() => {
        if (speakTrigger > 0 && text && text.trim() !== '') {
            console.log(`🗣️ Avatar Component: Received speak trigger #${speakTrigger} for text:`, text.substring(0, 30) + "...");
            speak(text);
        }

        return () => {
            stopLipSync();
        };
    }, [speakTrigger, text, speak, stopLipSync]);

    // Stop lip sync and audio when text is cleared
    useEffect(() => {
        if (!text || text.trim() === '') {
            stopLipSync();
            stopSpeaking(); // Stop any legacy global audio if necessary
        }
    }, [text, stopLipSync]);


    // This Function Contorls how The model is adjusted when he is talking
    useFrame((_, delta) => {
        if (!avtargroup.current) return

        // Base scale: normal view showing full body
        const basescale = 1.2
        // Talking scale: zoomed in to show upper body (chest and above)
        const talkingscale = 3

        // When ischatting is true, zoom in; otherwise show full body
        const targetscale = ischatting ? talkingscale : basescale

        const speed = 5

        //position of the model
        const currentpos = avtargroup.current.position.y
        const targetpos = ischatting ? -4.5 : -1

        // rotation of the model
        const currentrot = avtargroup.current.rotation.x
        const targetrot = ischatting ? -0.2 : 0

        // Scale of the model
        const currentscale = avtargroup.current.scale.x
        const nextscale = currentscale + (targetscale - currentscale) * speed * delta

        // ANimation Applied for all the targets
        avtargroup.current.scale.set(nextscale, nextscale, nextscale)
        avtargroup.current.position.y = currentpos + (targetpos - currentpos) * speed * delta
        avtargroup.current.rotation.x = currentrot + (targetrot - currentrot) * speed * delta
    })




    // ============================================
    // VISEME-DRIVEN LIP SYNC ANIMATION
    // ============================================
    // This useFrame runs every frame (~60fps) to update mouth morph targets
    // ============================================
    // OLD VISEME ANIMATION LOOP REMOVED
    // The useLipSync hook now handles all shape key updates efficiently.
    // ============================================

    // This Function targets Arms for animation
    useEffect(() => {

        scene.traverse((obj) => {
            // Collect skinned meshes
            if (obj.isSkinnedMesh) {
                meshes.current.push(obj);
            }

            // Find bones for animation
            if (obj.isBone) {
                switch (obj.name) {
                    case "RightArm":
                        rightArm.current = obj;
                        break;
                    case "LeftArm":
                        leftArm.current = obj;
                        break;
                    case "RightForeArm":
                        rightForeArm.current = obj;
                        break;
                    case "LeftForeArm":
                        leftForeArm.current = obj;
                        break;
                    case "LeftHand":
                        leftHand.current = obj;
                        break;
                    case "RightHand":
                        rightHand.current = obj;
                        break;
                    case "Head":
                        head.current = obj;
                        break;
                    case "Spine2":
                        spine.current = obj;
                        break;
                }
            }
        });

    }, [scene]);

    useFrame((state, delta) => {
        if (rightArm.current && rightForeArm.current && rightHand.current) {

        }
    })




    useFrame((state, delta) => {
        time.current += delta;

        if (emotions?.toLowerCase() === "happy") {
            // Apply smile using morph targets
            if (headMesh.current && teethMesh.current) {
                const hDict = headMesh.current.morphTargetDictionary;
                const hInfl = headMesh.current.morphTargetInfluences;
                const tDict = teethMesh.current.morphTargetDictionary;
                const tInfl = teethMesh.current.morphTargetInfluences;



                // Debug: Log available morph targets (only once)
                if (!window.morphTargetsLogged) {
                    console.log("Available Head Morph Targets:", Object.keys(hDict));
                    console.log("Available Teeth Morph Targets:", Object.keys(tDict));
                    window.morphTargetsLogged = true;
                }

                // Smooth smile intensity (1.0 configured for happy)
                const targetSmile = currentEmotion.smileIntensity || 0;
                const blendSpeed = 0.2; // Faster transition (was 0.05)
                const lerp = (current, target, factor) => current + (target - current) * factor;
                const smoothStep = (t) => t * t * (3 - 2 * t);


                if (head.current && !headResetDone.current) {

                    // Capture starting rotation ONCE
                    if (headTransitionTime.current === 0) {
                        headStartRot.current = {
                            x: head.current.rotation.x,
                            y: head.current.rotation.y,
                            z: head.current.rotation.z,
                        };
                    }

                    headTransitionTime.current += delta;

                    const duration = 0.8; // seconds
                    const t = Math.min(headTransitionTime.current / duration, 1);
                    const progress = smoothStep(t);

                    head.current.rotation.x = lerp(headStartRot.current.x, -0.2, progress);
                    head.current.rotation.y = lerp(headStartRot.current.y, 0, progress);
                    head.current.rotation.z = lerp(headStartRot.current.z, 0, progress);

                    if (t >= 1) {
                        headResetDone.current = true;   // NEVER AGAIN
                    }
                }

                if (leftEye.current.rotation.y !== 0) {
                    leftEye.current.rotation.y = lerp(leftEye.current.rotation.y, 0, 0.1);
                    rightEye.current.rotation.y = lerp(rightEye.current.rotation.y, 0, 0.1);
                }


                // ========================================
                // ARM REPOSITIONING - Smooth transition to neutral
                // ========================================
                if (!armResetDone.current && rightArm.current && leftArm.current && rightForeArm.current && leftForeArm.current) {
                    const smoothStep = (t) => t * t * (3 - 2 * t);

                    // Capture starting rotations ONCE
                    if (armTransitionTime.current === 0) {
                        armStartRot.current = {
                            rightArm: { x: rightArm.current.rotation.x, y: rightArm.current.rotation.y, z: rightArm.current.rotation.z },
                            leftArm: { x: leftArm.current.rotation.x, y: leftArm.current.rotation.y, z: leftArm.current.rotation.z },
                            rightForeArm: { x: rightForeArm.current.rotation.x, y: rightForeArm.current.rotation.y, z: rightForeArm.current.rotation.z },
                            leftForeArm: { x: leftForeArm.current.rotation.x, y: leftForeArm.current.rotation.y, z: leftForeArm.current.rotation.z }
                        };
                    }

                    armTransitionTime.current += delta;

                    const duration = 0.8; // seconds
                    const t = Math.min(armTransitionTime.current / duration, 1);
                    const progress = smoothStep(t);

                    // Transition to neutral position (handpos for x, 0 for y and z)
                    rightArm.current.rotation.x = lerp(armStartRot.current.rightArm.x, handpos, progress);
                    rightArm.current.rotation.y = lerp(armStartRot.current.rightArm.y, 0, progress);
                    rightArm.current.rotation.z = lerp(armStartRot.current.rightArm.z, 0, progress);

                    leftArm.current.rotation.x = lerp(armStartRot.current.leftArm.x, handpos, progress);
                    leftArm.current.rotation.y = lerp(armStartRot.current.leftArm.y, 0, progress);
                    leftArm.current.rotation.z = lerp(armStartRot.current.leftArm.z, 0, progress);

                    rightForeArm.current.rotation.x = lerp(armStartRot.current.rightForeArm.x, 0, progress);
                    rightForeArm.current.rotation.y = lerp(armStartRot.current.rightForeArm.y, 0, progress);
                    rightForeArm.current.rotation.z = lerp(armStartRot.current.rightForeArm.z, 0, progress);

                    leftForeArm.current.rotation.x = lerp(armStartRot.current.leftForeArm.x, 0, progress);
                    leftForeArm.current.rotation.y = lerp(armStartRot.current.leftForeArm.y, 0, progress);
                    leftForeArm.current.rotation.z = lerp(armStartRot.current.leftForeArm.z, 0, progress);

                    if (t >= 1) {
                        armResetDone.current = true; // Mark transition complete
                    }
                }
                // Apply smile to mouthSmile morph target
                if (hDict.mouthSmile !== undefined) {
                    const currentValue = Number(hInfl[hDict.mouthSmile]) || 0;
                    hInfl[hDict.mouthSmile] = clampMorphInfluence(lerp(currentValue, targetSmile, blendSpeed));

                    // Debug log (only when value changes significantly)
                    if (Math.abs(hInfl[hDict.mouthSmile] - targetSmile) > 0.01) {
                        console.log("mouthSmile:", hInfl[hDict.mouthSmile].toFixed(3), "/ target:", targetSmile);
                    }
                } else {
                    if (!window.mouthSmileWarned) {
                        console.log("mouthSmile morph target NOT FOUND");
                        window.mouthSmileWarned = true;
                    }
                }

                // Also apply to teeth if available
                if (tDict.mouthSmile !== undefined) {
                    const currentValue = Number(tInfl[tDict.mouthSmile]) || 0;
                    tInfl[tDict.mouthSmile] = clampMorphInfluence(lerp(currentValue, targetSmile, blendSpeed));
                }

                // Add slight mouth open for natural smile (optional)
                if (hDict.viseme_aa !== undefined) {
                    const currentValue = Number(hInfl[hDict.viseme_aa]) || 0;
                    hInfl[hDict.viseme_aa] = clampMorphInfluence(lerp(currentValue, targetSmile * 0.2, blendSpeed));
                }
                if (tDict.viseme_aa !== undefined) {
                    const currentValue = Number(tInfl[tDict.viseme_aa]) || 0;
                    tInfl[tDict.viseme_aa] = clampMorphInfluence(lerp(currentValue, targetSmile * 0.2, blendSpeed));
                }

            }
        }
        else if (currentEmotion.customHandPath && emotions?.toLowerCase() === 'explain2') {
            // ========================================
            // EXPLAIN2 CUSTOM GESTURE - Both Arms
            // ========================================
            const animationCycle = 8;
            const cycleTime = time.current % animationCycle;
            const rightCycle = 12;
            const rightCycleTime = (time.current + 1) % rightCycle;

            // Helper functions
            const lerp = (start, end, t) => start + (end - start) * Math.min(Math.max(t, 0), 1);
            const smoothStep = (t) => t * t * (3 - 2 * t);
            if (!armResetDone.current && rightArm.current && leftArm.current && rightForeArm.current && leftForeArm.current) {
                const smoothStep1 = (t) => t * t * (3 - 2 * t);

                // Capture starting rotations ONCE
                if (armTransitionTime.current === 0) {
                    armStartRot.current = {
                        rightArm: { x: rightArm.current.rotation.x, y: rightArm.current.rotation.y, z: rightArm.current.rotation.z },
                        leftArm: { x: leftArm.current.rotation.x, y: leftArm.current.rotation.y, z: leftArm.current.rotation.z },
                        rightForeArm: { x: rightForeArm.current.rotation.x, y: rightForeArm.current.rotation.y, z: rightForeArm.current.rotation.z },
                        leftForeArm: { x: leftForeArm.current.rotation.x, y: leftForeArm.current.rotation.y, z: leftForeArm.current.rotation.z }
                    };
                }

                armTransitionTime.current += delta;

                const duration = 0.8; // seconds
                const t = Math.min(armTransitionTime.current / duration, 1);
                const progress = smoothStep1(t);

                // Transition to neutral position (handpos for x, 0 for y and z)
                rightArm.current.rotation.x = lerp(armStartRot.current.rightArm.x, handpos, progress);
                rightArm.current.rotation.y = lerp(armStartRot.current.rightArm.y, 0, progress);
                rightArm.current.rotation.z = lerp(armStartRot.current.rightArm.z, 0, progress);

                leftArm.current.rotation.x = lerp(armStartRot.current.leftArm.x, handpos, progress);
                leftArm.current.rotation.y = lerp(armStartRot.current.leftArm.y, 0, progress);
                leftArm.current.rotation.z = lerp(armStartRot.current.leftArm.z, 0, progress);

                rightForeArm.current.rotation.x = lerp(armStartRot.current.rightForeArm.x, 0, progress);
                rightForeArm.current.rotation.y = lerp(armStartRot.current.rightForeArm.y, 0, progress);
                rightForeArm.current.rotation.z = lerp(armStartRot.current.rightForeArm.z, 0, progress);

                leftForeArm.current.rotation.x = lerp(armStartRot.current.leftForeArm.x, 0, progress);
                leftForeArm.current.rotation.y = lerp(armStartRot.current.leftForeArm.y, 0, progress);
                leftForeArm.current.rotation.z = lerp(armStartRot.current.leftForeArm.z, 0, progress);

                if (t >= 1) {
                    armResetDone.current = true; // Mark transition complete
                }
            }

            if (head.current && !headResetDone.current) {

                // Capture starting rotation ONCE
                if (headTransitionTime.current === 0) {
                    headStartRot.current = {
                        x: head.current.rotation.x,
                        y: head.current.rotation.y,
                        z: head.current.rotation.z,
                    };
                }

                headTransitionTime.current += delta;

                const duration = 0.8; // seconds
                const t = Math.min(headTransitionTime.current / duration, 1);
                const progress = smoothStep(t);

                head.current.rotation.x = lerp(headStartRot.current.x, -0.2, progress);
                head.current.rotation.y = lerp(headStartRot.current.y, 0, progress);
                head.current.rotation.z = lerp(headStartRot.current.z, 0, progress);

                if (t >= 1) {
                    headResetDone.current = true;   // NEVER AGAIN
                }
            }


            if (leftEye.current.rotation.y !== 0) {
                leftEye.current.rotation.y = lerp(leftEye.current.rotation.y, 0, 0.1);
                rightEye.current.rotation.y = lerp(rightEye.current.rotation.y, 0, 0.1);
            }

            // RIGHT ARM - Complementary Presentation Gesture
            if (rightArm.current && rightForeArm.current && rightHand.current) {

                let rightArmRotationZ = 0;
                let rightArmRotationX = 0;
                let rightForearmRotationZ = 0;
                let rightForearmRotationY = 0;
                let rightForearmRotationX = 0;

                if (currentEmotion.gestureReset === 1) {
                    // Start transition
                    if (!isTransitioning.current) {
                        isTransitioning.current = true;
                        transitionTime.current = 0;
                        // Store starting rotations
                        transitionStartRotations.current.right = {
                            x: rightForeArm.current.rotation.x,
                            y: rightForeArm.current.rotation.y,
                            z: rightForeArm.current.rotation.z
                        };
                        transitionStartRotations.current.left = {
                            x: leftForeArm.current.rotation.x,
                            y: leftForeArm.current.rotation.y,
                            z: leftForeArm.current.rotation.z
                        };
                    }

                    // Increment time each frame
                    transitionTime.current += delta;

                    const transitionDuration = 1.0; // 1 second transition
                    const normalizedTime = Math.min(transitionTime.current / transitionDuration, 1);
                    const progress = smoothStep(normalizedTime);

                    // Apply smooth transitions from start position to 0
                    rightForeArm.current.rotation.x = lerp(transitionStartRotations.current.right.x, 0, progress);
                    rightForeArm.current.rotation.y = lerp(transitionStartRotations.current.right.y, 0, progress);
                    rightForeArm.current.rotation.z = lerp(transitionStartRotations.current.right.z, 0, progress);

                    leftForeArm.current.rotation.x = lerp(transitionStartRotations.current.left.x, 0, progress);
                    leftForeArm.current.rotation.y = lerp(transitionStartRotations.current.left.y, 0, progress);
                    leftForeArm.current.rotation.z = lerp(transitionStartRotations.current.left.z, 0, progress);

                    // End transition when complete
                    if (normalizedTime >= 1) {
                        currentEmotion.gestureReset = 0;
                        isTransitioning.current = false;
                    }
                }


                if (rightCycleTime < 2) {
                    rightArmRotationZ = 0;
                    rightArmRotationX = 0;
                    rightForearmRotationZ = 0;
                    rightForearmRotationY = 0;
                    rightForearmRotationX = 0;
                }
                else if (rightCycleTime < 3.5) {
                    const progress = smoothStep((rightCycleTime - 2) / 1.5);
                    rightArmRotationZ = lerp(0, 0, progress);
                    rightArmRotationX = lerp(0, 0, progress);
                    rightForearmRotationY = lerp(0, 0.2, progress);
                    rightForearmRotationZ = lerp(0, -1.2, progress);
                    rightForearmRotationX = lerp(0, 1.5, progress);
                }
                else if (rightCycleTime < 4) {
                    rightArmRotationZ = 0;
                    rightArmRotationX = 0;
                    rightForearmRotationZ = -1.2;
                    rightForearmRotationY = 0.2;
                    rightForearmRotationX = 1.5;
                }
                else if (rightCycleTime < 8) {
                    const progress = smoothStep((rightCycleTime - 4) / 4);
                    rightArmRotationZ = lerp(0, 0, progress);
                    rightArmRotationX = lerp(0, 0, progress);
                    rightForearmRotationX = lerp(1.5, 0, progress);
                    rightForearmRotationY = lerp(0.2, -1, progress);
                    rightForearmRotationZ = lerp(-1.2, -1.2, progress);
                }
                else {
                    const progress = smoothStep((rightCycleTime - 8) / 4);
                    rightArmRotationZ = lerp(0, 0, progress);
                    rightArmRotationX = lerp(0, 0, progress);
                    rightForearmRotationX = lerp(0, 0, progress);
                    rightForearmRotationY = lerp(-1, 0, progress);
                    rightForearmRotationZ = lerp(-1.2, 0, progress);
                }

                rightArm.current.rotation.z = rightArmRotationZ;
                rightArm.current.rotation.x = rightArmRotationX + handpos;
                rightForeArm.current.rotation.z = rightForearmRotationZ;
                rightForeArm.current.rotation.y = rightForearmRotationY;
                rightForeArm.current.rotation.x = rightForearmRotationX;
            }

            // LEFT ARM - Presentation Gesture
            if (leftArm.current && leftForeArm.current && leftHand.current) {
                let leftArmRotationZ = 0;
                let leftArmRotationX = 0;
                let leftForearmRotationZ = 0;
                let leftForearmRotationY = 0;
                let leftForearmRotationX = 0;

                if (cycleTime < 2) {
                    leftArmRotationZ = 0;
                    leftArmRotationX = 0;
                    leftForearmRotationZ = 0;
                    leftForearmRotationY = 0;
                    leftForearmRotationX = 0;
                }
                else if (cycleTime < 3.5) {
                    const progress = smoothStep((cycleTime - 2) / 1.5);
                    leftArmRotationZ = lerp(0, 0, progress);
                    leftArmRotationX = lerp(0, 0, progress);
                    leftForearmRotationY = lerp(0, -0.2, progress);
                    leftForearmRotationZ = lerp(0, 1.2, progress);
                    leftForearmRotationX = lerp(0, 1.5, progress);
                }
                else if (cycleTime < 5) {
                    leftArmRotationZ = 0;
                    leftArmRotationX = 0;
                    leftForearmRotationZ = 1.2;
                    leftForearmRotationY = -0.2;
                    leftForearmRotationX = 1.5;
                }
                else {
                    const progress = smoothStep((cycleTime - 5) / 3);
                    leftArmRotationZ = lerp(0, 0, progress);
                    leftArmRotationX = lerp(0, 0, progress);
                    leftForearmRotationZ = lerp(1.2, 0, progress);
                    leftForearmRotationY = lerp(-0.2, 0, progress);
                    leftForearmRotationX = lerp(1.5, 0, progress);
                }

                leftArm.current.rotation.z = leftArmRotationZ;
                leftArm.current.rotation.x = leftArmRotationX + handpos;
                leftForeArm.current.rotation.z = leftForearmRotationZ;
                leftForeArm.current.rotation.y = leftForearmRotationY;
                leftForeArm.current.rotation.x = leftForearmRotationX;
            }
        }
        else if (currentEmotion.customHandPath && emotions?.toLowerCase() === 'explain1') {
            const animationCycle = 8;
            const cycleTime = time.current % animationCycle;
            const rightCycle = 12;
            const rightCycleTime = (time.current + 1) % rightCycle;

            // Helper functions
            const lerp = (current, target, factor) => current + (target - current) * factor;
            const smoothStep = (t) => t * t * (3 - 2 * t);

            if (!armResetDone.current && rightArm.current && leftArm.current && rightForeArm.current && leftForeArm.current) {
                const smoothStep1 = (t) => t * t * (3 - 2 * t);

                // Capture starting rotations ONCE
                if (armTransitionTime.current === 0) {
                    armStartRot.current = {
                        rightArm: { x: rightArm.current.rotation.x, y: rightArm.current.rotation.y, z: rightArm.current.rotation.z },
                        leftArm: { x: leftArm.current.rotation.x, y: leftArm.current.rotation.y, z: leftArm.current.rotation.z },
                        rightForeArm: { x: rightForeArm.current.rotation.x, y: rightForeArm.current.rotation.y, z: rightForeArm.current.rotation.z },
                        leftForeArm: { x: leftForeArm.current.rotation.x, y: leftForeArm.current.rotation.y, z: leftForeArm.current.rotation.z }
                    };
                }

                armTransitionTime.current += delta;

                const duration = 0.8; // seconds
                const t = Math.min(armTransitionTime.current / duration, 1);
                const progress = smoothStep1(t);

                rightForeArm.current.rotation.x = lerp(armStartRot.current.rightForeArm.x, 0, progress);
                rightForeArm.current.rotation.y = lerp(armStartRot.current.rightForeArm.y, 0, progress);
                rightForeArm.current.rotation.z = lerp(armStartRot.current.rightForeArm.z, 0, progress);

                leftForeArm.current.rotation.x = lerp(armStartRot.current.leftForeArm.x, 0, progress);
                leftForeArm.current.rotation.y = lerp(armStartRot.current.leftForeArm.y, 0, progress);
                leftForeArm.current.rotation.z = lerp(armStartRot.current.leftForeArm.z, 0, progress);

                if (t >= 1) {
                    armResetDone.current = true; // Mark transition complete
                }
            }


            if (head.current && !headResetDone.current) {

                // Capture starting rotation ONCE
                if (headTransitionTime.current === 0) {
                    headStartRot.current = {
                        x: head.current.rotation.x,
                        y: head.current.rotation.y,
                        z: head.current.rotation.z,
                    };
                }

                headTransitionTime.current += delta;

                const duration = 0.8; // seconds
                const t = Math.min(headTransitionTime.current / duration, 1);
                const progress = smoothStep(t);

                head.current.rotation.x = lerp(headStartRot.current.x, -0.2, progress);
                head.current.rotation.y = lerp(headStartRot.current.y, 0, progress);
                head.current.rotation.z = lerp(headStartRot.current.z, 0, progress);

                if (t >= 1) {
                    headResetDone.current = true;   // NEVER AGAIN
                }
            }

            if (leftEye.current.rotation.y !== 0) {
                leftEye.current.rotation.y = lerp(leftEye.current.rotation.y, 0, 0.1);
                rightEye.current.rotation.y = lerp(rightEye.current.rotation.y, 0, 0.1);
            }


            // RIGHT ARM - Complementary Presentation Gesture
            if (rightArm.current && rightForeArm.current && rightHand.current) {

                let rightArmRotationZ = 0;
                let rightArmRotationX = 0;
                let rightForearmRotationZ = 0;
                let rightForearmRotationY = 0;
                let rightForearmRotationX = 0;


                if (rightCycleTime < 2) {
                    rightArmRotationZ = 0;
                    rightArmRotationX = 0;
                    rightForearmRotationZ = 0;
                    rightForearmRotationY = 0;
                    rightForearmRotationX = 0;
                }
                else if (rightCycleTime < 3.5) {
                    const progress = smoothStep((rightCycleTime - 2) / 1.5);
                    rightArmRotationZ = lerp(0, 0, progress);
                    rightArmRotationX = lerp(0, 0, progress);
                    rightForearmRotationY = lerp(0, 0.1, progress);
                    rightForearmRotationZ = lerp(0, -0.6, progress);
                    rightForearmRotationX = lerp(0, 0.8, progress);
                }
                else if (rightCycleTime < 4) {
                    rightArmRotationZ = 0;
                    rightArmRotationX = 0;
                    rightForearmRotationZ = -0.6;
                    rightForearmRotationY = 0.1;
                    rightForearmRotationX = 0.8;
                }
                else if (rightCycleTime < 8) {
                    const progress = smoothStep((rightCycleTime - 4) / 4);
                    rightArmRotationZ = lerp(0, 0, progress);
                    rightArmRotationX = lerp(0, 0, progress);
                    rightForearmRotationX = lerp(0.8, 0, progress);
                    rightForearmRotationY = lerp(0.1, -0.5, progress);
                    rightForearmRotationZ = lerp(-0.6, -0.6, progress);
                }
                else {
                    const progress = smoothStep((rightCycleTime - 8) / 4);
                    rightArmRotationZ = lerp(0, 0, progress);
                    rightArmRotationX = lerp(0, 0, progress);
                    rightForearmRotationX = lerp(0, 0, progress);
                    rightForearmRotationY = lerp(-0.5, 0, progress);
                    rightForearmRotationZ = lerp(-0.6, 0, progress);
                }

                rightArm.current.rotation.z = rightArmRotationZ;
                rightArm.current.rotation.x = rightArmRotationX + handpos;
                rightForeArm.current.rotation.z = rightForearmRotationZ;
                rightForeArm.current.rotation.y = rightForearmRotationY;
                rightForeArm.current.rotation.x = rightForearmRotationX;
            }

            // LEFT ARM - Presentation Gesture
            if (leftArm.current && leftForeArm.current && leftHand.current) {
                let leftArmRotationZ = 0;
                let leftArmRotationX = 0;
                let leftForearmRotationZ = 0;
                let leftForearmRotationY = 0;
                let leftForearmRotationX = 0;

                if (cycleTime < 2) {
                    leftArmRotationZ = 0;
                    leftArmRotationX = 0;
                    leftForearmRotationZ = 0;
                    leftForearmRotationY = 0;
                    leftForearmRotationX = 0;
                }
                else if (cycleTime < 3.5) {
                    const progress = smoothStep((cycleTime - 2) / 1.5);
                    leftArmRotationZ = lerp(0, 0, progress);
                    leftArmRotationX = lerp(0, 0, progress);
                    leftForearmRotationY = lerp(0, -0.1, progress);
                    leftForearmRotationZ = lerp(0, 0.6, progress);
                    leftForearmRotationX = lerp(0, 0.8, progress);
                }
                else if (cycleTime < 5) {
                    leftArmRotationZ = 0;
                    leftArmRotationX = 0;
                    leftForearmRotationZ = 0.6;
                    leftForearmRotationY = -0.1;
                    leftForearmRotationX = 0.8;
                }
                else {
                    const progress = smoothStep((cycleTime - 5) / 3);
                    leftArmRotationZ = lerp(0, 0, progress);
                    leftArmRotationX = lerp(0, 0, progress);
                    leftForearmRotationZ = lerp(0.6, 0, progress);
                    leftForearmRotationY = lerp(-0.1, 0, progress);
                    leftForearmRotationX = lerp(0.8, 0, progress);
                }

                leftArm.current.rotation.z = leftArmRotationZ;
                leftArm.current.rotation.x = leftArmRotationX + handpos;
                leftForeArm.current.rotation.z = leftForearmRotationZ;
                leftForeArm.current.rotation.y = leftForearmRotationY;
                leftForeArm.current.rotation.x = leftForearmRotationX;
            }
        }
        else if (emotions?.toLowerCase() === "sad") {
            if (headMesh.current && teethMesh.current) {
                const hDict = headMesh.current.morphTargetDictionary;
                const hInfl = headMesh.current.morphTargetInfluences;
                const tDict = teethMesh.current.morphTargetDictionary;
                const tInfl = teethMesh.current.morphTargetInfluences;


                // Smooth smile intensity (1.0 configured for happy)
                const targetSmile = currentEmotion.smileIntensity || 0;
                const blendSpeed = 0.2; // Faster transition (was 0.05)
                const lerp = (current, target, factor) => current + (target - current) * factor;
                const smoothStep = (t) => t * t * (3 - 2 * t);


                if (head.current && !headResetDone.current) {

                    // Capture starting rotation ONCE
                    if (headTransitionTime.current === 0) {
                        headStartRot.current = {
                            x: head.current.rotation.x,
                            y: head.current.rotation.y,
                            z: head.current.rotation.z,
                        };
                    }

                    headTransitionTime.current += delta;

                    const duration = 0.8; // seconds
                    const t = Math.min(headTransitionTime.current / duration, 1);
                    const progress = smoothStep(t);

                    head.current.rotation.x = lerp(headStartRot.current.x, 0, progress);
                    head.current.rotation.y = lerp(headStartRot.current.y, 0, progress);
                    head.current.rotation.z = lerp(headStartRot.current.z, 0, progress);

                    if (t >= 1) {
                        headResetDone.current = true;   // NEVER AGAIN
                    }
                }
                // ========================================
                // ARM REPOSITIONING - Smooth transition to neutral
                // ========================================
                if (!armResetDone.current && rightArm.current && leftArm.current && rightForeArm.current && leftForeArm.current) {
                    const smoothStep = (t) => t * t * (3 - 2 * t);

                    // Capture starting rotations ONCE
                    if (armTransitionTime.current === 0) {
                        armStartRot.current = {
                            rightArm: { x: rightArm.current.rotation.x, y: rightArm.current.rotation.y, z: rightArm.current.rotation.z },
                            leftArm: { x: leftArm.current.rotation.x, y: leftArm.current.rotation.y, z: leftArm.current.rotation.z },
                            rightForeArm: { x: rightForeArm.current.rotation.x, y: rightForeArm.current.rotation.y, z: rightForeArm.current.rotation.z },
                            leftForeArm: { x: leftForeArm.current.rotation.x, y: leftForeArm.current.rotation.y, z: leftForeArm.current.rotation.z }
                        };
                    }

                    armTransitionTime.current += delta;

                    const duration = 0.8; // seconds
                    const t = Math.min(armTransitionTime.current / duration, 1);
                    const progress = smoothStep(t);

                    // Transition to neutral position (handpos for x, 0 for y and z)
                    rightArm.current.rotation.x = lerp(armStartRot.current.rightArm.x, handpos, progress);
                    rightArm.current.rotation.y = lerp(armStartRot.current.rightArm.y, 0, progress);
                    rightArm.current.rotation.z = lerp(armStartRot.current.rightArm.z, 0, progress);

                    leftArm.current.rotation.x = lerp(armStartRot.current.leftArm.x, handpos, progress);
                    leftArm.current.rotation.y = lerp(armStartRot.current.leftArm.y, 0, progress);
                    leftArm.current.rotation.z = lerp(armStartRot.current.leftArm.z, 0, progress);

                    rightForeArm.current.rotation.x = lerp(armStartRot.current.rightForeArm.x, 0, progress);
                    rightForeArm.current.rotation.y = lerp(armStartRot.current.rightForeArm.y, 0, progress);
                    rightForeArm.current.rotation.z = lerp(armStartRot.current.rightForeArm.z, 0, progress);

                    leftForeArm.current.rotation.x = lerp(armStartRot.current.leftForeArm.x, 0, progress);
                    leftForeArm.current.rotation.y = lerp(armStartRot.current.leftForeArm.y, 0, progress);
                    leftForeArm.current.rotation.z = lerp(armStartRot.current.leftForeArm.z, 0, progress);

                    if (t >= 1) {
                        armResetDone.current = true; // Mark transition complete
                    }
                }

                if (hDict.blink !== undefined) {
                    hInfl[hDict.blink] = clampMorphInfluence(0.4);
                }

                // Apply smile to mouthSmile morph target
                if (hDict.mouthSmile !== undefined) {
                    const currentValue = Number(hInfl[hDict.mouthSmile]) || 0;
                    hInfl[hDict.mouthSmile] = clampMorphInfluence(lerp(currentValue, targetSmile, blendSpeed));

                    // Debug log (only when value changes significantly)
                    if (Math.abs(hInfl[hDict.mouthSmile] - targetSmile) > 0.01) {
                        console.log("mouthSmile:", hInfl[hDict.mouthSmile].toFixed(3), "/ target:", targetSmile);
                    }
                } else {
                    if (!window.mouthSmileWarned) {
                        console.log("mouthSmile morph target NOT FOUND");
                        window.mouthSmileWarned = true;
                    }
                }

                // Also apply to teeth if available
                if (tDict.mouthSmile !== undefined) {
                    const currentValue = Number(tInfl[tDict.mouthSmile]) || 0;
                    tInfl[tDict.mouthSmile] = clampMorphInfluence(lerp(currentValue, targetSmile, blendSpeed));
                }

                // Add slight mouth open for natural smile (optional)
                if (hDict.viseme_aa !== undefined) {
                    const currentValue = Number(hInfl[hDict.viseme_aa]) || 0;
                    hInfl[hDict.viseme_aa] = clampMorphInfluence(lerp(currentValue, targetSmile * 0.2, blendSpeed));
                }
                if (tDict.viseme_aa !== undefined) {
                    const currentValue = Number(tInfl[tDict.viseme_aa]) || 0;
                    tInfl[tDict.viseme_aa] = clampMorphInfluence(lerp(currentValue, targetSmile * 0.2, blendSpeed));
                }

            }
        }
        else if (emotions?.toLowerCase() === "natural") {
            if (headMesh.current && teethMesh.current) {
                const hDict = headMesh.current.morphTargetDictionary;
                const hInfl = headMesh.current.morphTargetInfluences;
                const tDict = teethMesh.current.morphTargetDictionary;
                const tInfl = teethMesh.current.morphTargetInfluences;

                // Smooth smile intensity (1.0 configured for happy)
                const targetSmile = currentEmotion.smileIntensity || 0;
                const blendSpeed = 0.2; // Faster transition (was 0.05)
                const lerp = (current, target, factor) => current + (target - current) * factor;
                const smoothStep = (t) => t * t * (3 - 2 * t);

                if (head.current && !headResetDone.current) {

                    // Capture starting rotation ONCE
                    if (headTransitionTime.current === 0) {
                        headStartRot.current = {
                            x: head.current.rotation.x,
                            y: head.current.rotation.y,
                            z: head.current.rotation.z,
                        };
                    }

                    headTransitionTime.current += delta;

                    const duration = 0.8; // seconds
                    const t = Math.min(headTransitionTime.current / duration, 1);
                    const progress = smoothStep(t);

                    head.current.rotation.x = lerp(headStartRot.current.x, -0.2, progress);
                    head.current.rotation.y = lerp(headStartRot.current.y, 0, progress);
                    head.current.rotation.z = lerp(headStartRot.current.z, 0, progress);

                    if (t >= 1) {
                        headResetDone.current = true;   // NEVER AGAIN
                    }
                }

                if (leftEye.current.rotation.y !== 0) {
                    leftEye.current.rotation.y = lerp(leftEye.current.rotation.y, 0, 0.1);
                    rightEye.current.rotation.y = lerp(rightEye.current.rotation.y, 0, 0.1);
                }

                // ========================================
                // ARM REPOSITIONING - Smooth transition to neutral
                // ========================================
                if (!armResetDone.current && rightArm.current && leftArm.current && rightForeArm.current && leftForeArm.current) {
                    const smoothStep = (t) => t * t * (3 - 2 * t);

                    // Capture starting rotations ONCE
                    if (armTransitionTime.current === 0) {
                        armStartRot.current = {
                            rightArm: { x: rightArm.current.rotation.x, y: rightArm.current.rotation.y, z: rightArm.current.rotation.z },
                            leftArm: { x: leftArm.current.rotation.x, y: leftArm.current.rotation.y, z: leftArm.current.rotation.z },
                            rightForeArm: { x: rightForeArm.current.rotation.x, y: rightForeArm.current.rotation.y, z: rightForeArm.current.rotation.z },
                            leftForeArm: { x: leftForeArm.current.rotation.x, y: leftForeArm.current.rotation.y, z: leftForeArm.current.rotation.z }
                        };
                    }

                    armTransitionTime.current += delta;

                    const duration = 0.8; // seconds
                    const t = Math.min(armTransitionTime.current / duration, 1);
                    const progress = smoothStep(t);

                    // Transition to neutral position (handpos for x, 0 for y and z)
                    rightArm.current.rotation.x = lerp(armStartRot.current.rightArm.x, handpos, progress);
                    rightArm.current.rotation.y = lerp(armStartRot.current.rightArm.y, 0, progress);
                    rightArm.current.rotation.z = lerp(armStartRot.current.rightArm.z, 0, progress);

                    leftArm.current.rotation.x = lerp(armStartRot.current.leftArm.x, handpos, progress);
                    leftArm.current.rotation.y = lerp(armStartRot.current.leftArm.y, 0, progress);
                    leftArm.current.rotation.z = lerp(armStartRot.current.leftArm.z, 0, progress);

                    rightForeArm.current.rotation.x = lerp(armStartRot.current.rightForeArm.x, 0, progress);
                    rightForeArm.current.rotation.y = lerp(armStartRot.current.rightForeArm.y, 0, progress);
                    rightForeArm.current.rotation.z = lerp(armStartRot.current.rightForeArm.z, 0, progress);

                    leftForeArm.current.rotation.x = lerp(armStartRot.current.leftForeArm.x, 0, progress);
                    leftForeArm.current.rotation.y = lerp(armStartRot.current.leftForeArm.y, 0, progress);
                    leftForeArm.current.rotation.z = lerp(armStartRot.current.leftForeArm.z, 0, progress);

                    if (t >= 1) {
                        armResetDone.current = true; // Mark transition complete
                    }
                }

                // Apply smile to mouthSmile morph target
                if (hDict.mouthSmile !== undefined) {
                    const currentValue = Number(hInfl[hDict.mouthSmile]) || 0;
                    hInfl[hDict.mouthSmile] = clampMorphInfluence(lerp(currentValue, targetSmile, blendSpeed));

                    // Debug log (only when value changes significantly)
                    if (Math.abs(hInfl[hDict.mouthSmile] - targetSmile) > 0.01) {
                        console.log("mouthSmile:", hInfl[hDict.mouthSmile].toFixed(3), "/ target:", targetSmile);
                    }
                } else {
                    if (!window.mouthSmileWarned) {
                        console.log("mouthSmile morph target NOT FOUND");
                        window.mouthSmileWarned = true;
                    }
                }

                // ========================================
                // NATURAL IDLE ANIMATION - Both Arms
                // ========================================
                // Subtle, realistic movements that mimic natural breathing and idle behavior

                // Multiple sine waves at different frequencies for natural variation
                const breathingCycle = Math.sin(time.current * 0.5) * 0.03; // Slow breathing motion
                const idleSway = Math.sin(time.current * 0.3) * 0.02; // Very slow sway

                // RIGHT ARM - Natural idle movement
                if (rightArm.current && rightForeArm.current && rightHand.current) {
                    // Subtle shoulder movement (breathing)
                    const rightShoulderBreath = Math.sin(time.current * 0.6) * 0.015;
                    const rightShoulderSway = Math.sin(time.current * 0.4 + 0.5) * 0.01;

                    // Gentle forearm movement
                    const rightForearmFloat = Math.sin(time.current * 0.7 + 1) * 0.02;
                    const rightForearmTwist = Math.sin(time.current * 0.35) * 0.01;

                    rightArm.current.rotation.x = handpos + rightShoulderBreath;
                    rightArm.current.rotation.z = rightShoulderSway;
                    rightForeArm.current.rotation.x = rightForearmFloat;
                    rightForeArm.current.rotation.y = rightForearmTwist;
                    rightForeArm.current.rotation.z = breathingCycle * 0.5;
                }

                // LEFT ARM - Natural idle movement (slightly offset for asymmetry)
                if (leftArm.current && leftForeArm.current && leftHand.current) {
                    // Offset the timing slightly for more natural asymmetric movement
                    const leftShoulderBreath = Math.sin(time.current * 0.6 + 0.3) * 0.015;
                    const leftShoulderSway = Math.sin(time.current * 0.4 + 1.2) * 0.01;

                    // Gentle forearm movement
                    const leftForearmFloat = Math.sin(time.current * 0.65 + 0.8) * 0.02;
                    const leftForearmTwist = Math.sin(time.current * 0.38 + 0.5) * 0.01;

                    leftArm.current.rotation.x = handpos + leftShoulderBreath;
                    leftArm.current.rotation.z = -leftShoulderSway; // Negative for opposite direction
                    leftForeArm.current.rotation.x = leftForearmFloat;
                    leftForeArm.current.rotation.y = -leftForearmTwist; // Negative for variation
                    leftForeArm.current.rotation.z = -breathingCycle * 0.5; // Opposite breathing
                }

            }
        }
        else if (emotions?.toLowerCase() === "think") {
            const smoothStep = (t) => t * t * (3 - 2 * t);
            const lerp = (current, target, factor) => current + (target - current) * factor;
            if (head.current && !headResetDone.current) {

                // Capture starting rotation ONCE
                if (headTransitionTime.current === 0) {
                    headStartRot.current = {
                        x: head.current.rotation.x,
                        y: head.current.rotation.y,
                        z: head.current.rotation.z,
                    };
                }

                headTransitionTime.current += delta;

                const duration = 0.8; // seconds
                const t = Math.min(headTransitionTime.current / duration, 1);
                const progress = smoothStep(t);

                head.current.rotation.x = lerp(headStartRot.current.x, -0.2, progress);
                head.current.rotation.y = lerp(headStartRot.current.y, 0, progress);
                head.current.rotation.z = lerp(headStartRot.current.z, 0, progress);

                if (t >= 1) {
                    headResetDone.current = true;   // NEVER AGAIN
                }
            }
            if (currentEmotion.eyeRoll && leftEye.current && rightEye.current) {
                thinkingTime.current += delta;

                const eyeRollCycle = 12;
                const cycleTime = time.current % eyeRollCycle;

                if (cycleTime < 2) {
                    // Phase 1: Move eyes/head to the right (0 to 3 seconds)
                    const progress = smoothStep(Math.min(cycleTime / 2, 1));
                    const angle = progress * 0.2;
                    leftEye.current.rotation.y = angle;
                    rightEye.current.rotation.y = angle;
                    head.current.rotation.y = angle;
                    head.current.rotation.x = -0.2 - (angle * 1);
                    head.current.rotation.z = angle;
                } else if (cycleTime < 6) {
                    // Phase 2: Nodding animation (2 to 6 seconds)
                    const nodTime = cycleTime - 2; // Time within this phase (0 to 4 seconds)
                    const nodCycle = 4; // 4 second per nod
                    const nodProgress = (nodTime % nodCycle) / nodCycle; // 0 to 1 for each nod

                    // Create smooth nodding motion using sine wave
                    const nodAngle = Math.sin(nodProgress * Math.PI * 2) * 0.10; // Nod amplitude

                    // Keep eyes and head Y at peak position
                    leftEye.current.rotation.y = 0.2;
                    rightEye.current.rotation.y = 0.2;
                    head.current.rotation.y = 0.2;

                    // Add nodding motion to X rotation
                    head.current.rotation.x = -0.4 + nodAngle * 1;
                    head.current.rotation.z = 0.2;
                }
                else if (cycleTime < 9) {
                    // Phase 3: Return to center (6 to 9 seconds)
                    const progress = smoothStep(Math.min((cycleTime - 6) / 3, 1));
                    const angle = 0.2 * (1 - progress);
                    leftEye.current.rotation.y = angle;
                    rightEye.current.rotation.y = angle;
                    head.current.rotation.y = angle;
                    head.current.rotation.x = -0.2 - (angle * 1);
                    head.current.rotation.z = angle;
                } else {
                    // Phase 4: Hold at center (9 to 12 seconds)
                    leftEye.current.rotation.y = 0;
                    rightEye.current.rotation.y = 0;
                    head.current.rotation.y = 0;
                    head.current.rotation.x = -0.2;
                    head.current.rotation.z = 0;
                }
            } else if (leftEye.current && rightEye.current) {
                // Reset eyes for other emotions
                leftEye.current.rotation.y = 0;
                rightEye.current.rotation.y = 0;
            }
        }
        else if (emotions?.toLowerCase() === "listen") {
            if (head.current) {
                const lerp = (current, target, factor) => current + (target - current) * factor;
                const smoothStep = (t) => t * t * (3 - 2 * t);
                if (head.current && !headResetDone.current) {

                    // Capture starting rotation ONCE
                    if (headTransitionTime.current === 0) {
                        headStartRot.current = {
                            x: head.current.rotation.x,
                            y: head.current.rotation.y,
                            z: head.current.rotation.z,
                        };
                    }

                    headTransitionTime.current += delta;

                    const duration = 0.8; // seconds
                    const t = Math.min(headTransitionTime.current / duration, 1);
                    const progress = smoothStep(t);

                    head.current.rotation.x = lerp(headStartRot.current.x, 0, progress);
                    head.current.rotation.y = lerp(headStartRot.current.y, 0, progress);
                    head.current.rotation.z = lerp(headStartRot.current.z, 0, progress);

                    if (t >= 1) {
                        headResetDone.current = true;   // NEVER AGAIN
                    }
                }
                if (leftEye.current.rotation.y !== 0) {
                    leftEye.current.rotation.y = lerp(leftEye.current.rotation.y, 0, 0.1);
                    rightEye.current.rotation.y = lerp(rightEye.current.rotation.y, 0, 0.1);
                }

                // ========================================
                // ARM REPOSITIONING - Smooth transition to neutral
                // ========================================
                if (!armResetDone.current && rightArm.current && leftArm.current && rightForeArm.current && leftForeArm.current) {
                    const smoothStep = (t) => t * t * (3 - 2 * t);

                    // Capture starting rotations ONCE
                    if (armTransitionTime.current === 0) {
                        armStartRot.current = {
                            rightArm: { x: rightArm.current.rotation.x, y: rightArm.current.rotation.y, z: rightArm.current.rotation.z },
                            leftArm: { x: leftArm.current.rotation.x, y: leftArm.current.rotation.y, z: leftArm.current.rotation.z },
                            rightForeArm: { x: rightForeArm.current.rotation.x, y: rightForeArm.current.rotation.y, z: rightForeArm.current.rotation.z },
                            leftForeArm: { x: leftForeArm.current.rotation.x, y: leftForeArm.current.rotation.y, z: leftForeArm.current.rotation.z }
                        };
                    }

                    armTransitionTime.current += delta;

                    const duration = 0.8; // seconds
                    const t = Math.min(armTransitionTime.current / duration, 1);
                    const progress = smoothStep(t);

                    // Transition to neutral position (handpos for x, 0 for y and z)
                    rightArm.current.rotation.x = lerp(armStartRot.current.rightArm.x, handpos, progress);
                    rightArm.current.rotation.y = lerp(armStartRot.current.rightArm.y, 0, progress);
                    rightArm.current.rotation.z = lerp(armStartRot.current.rightArm.z, 0, progress);

                    leftArm.current.rotation.x = lerp(armStartRot.current.leftArm.x, handpos, progress);
                    leftArm.current.rotation.y = lerp(armStartRot.current.leftArm.y, 0, progress);
                    leftArm.current.rotation.z = lerp(armStartRot.current.leftArm.z, 0, progress);

                    rightForeArm.current.rotation.x = lerp(armStartRot.current.rightForeArm.x, 0, progress);
                    rightForeArm.current.rotation.y = lerp(armStartRot.current.rightForeArm.y, 0, progress);
                    rightForeArm.current.rotation.z = lerp(armStartRot.current.rightForeArm.z, 0, progress);

                    leftForeArm.current.rotation.x = lerp(armStartRot.current.leftForeArm.x, 0, progress);
                    leftForeArm.current.rotation.y = lerp(armStartRot.current.leftForeArm.y, 0, progress);
                    leftForeArm.current.rotation.z = lerp(armStartRot.current.leftForeArm.z, 0, progress);

                    if (t >= 1) {
                        armResetDone.current = true; // Mark transition complete
                    }
                }

                const listenCycle = 6; // 2s nod + 3s pause
                const cycleTime = time.current % listenCycle;

                if (cycleTime < 3) {
                    // Nodding phase (0 to 2 seconds)
                    const nodSpeed = 2; // Speed of nodding
                    const nodAmplitude = 0.05; // Gentle nod
                    // Use sine wave for nodding, centered around a slightly tilted forward position (-0.1)
                    head.current.rotation.x = -0.1 + Math.sin(cycleTime * Math.PI * nodSpeed) * nodAmplitude;
                    head.current.rotation.y = 0;
                    head.current.rotation.z = 0;
                } else {
                    // Pause phase (2 to 5 seconds) - hold neutral/slightly tilted
                    // Smooth return to hold position if needed, or just hold
                    const smoothStep = (t) => t * t * (3 - 2 * t);

                    if (cycleTime < 2.5) {
                        // Smoothly transition to hold (0.5s transition)
                        const t = (cycleTime - 2) / 0.5;
                        const progress = smoothStep(t);
                        // Transition from last nod position to steady state
                        // Actually, simpler to just lerp to steady state
                        head.current.rotation.x = -0.1;
                    } else {
                        head.current.rotation.x = -0.1;
                    }
                    head.current.rotation.y = 0;
                    head.current.rotation.z = 0;
                }
            }
        }

        // Update all skinned meshes
        meshes.current.forEach(mesh => {
            if (mesh.skeleton) {
                mesh.skeleton.update();
            }
        });
    }, [emotions]);

    return (
        <group ref={groupRef}>
            <primitive
                ref={avtargroup}
                object={scene}
                scale={1.2}
                rotation={[0, 0, 0]}
                position={[0, -1, 0]}
            />
        </group>
    );
}

export default Avatar;


