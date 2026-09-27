import React, { useState } from 'react';
import { DEFAULT_RIGIDBODY_SETUP } from '../data/carData';

interface UnityScriptsModalProps {
  onClose: () => void;
}

const UNITY_FILES: { name: string; desc: string; code: string }[] = [
  {
    name: 'UIManager.cs',
    desc: 'Clickable Lobby Icons, OpenPanel(GameObject), ClosePanel(), PlayClickSound(), easeOutBack 0.2s animation & CanvasGroup blocking',
    code: `using System.Collections;
using UnityEngine;
using UnityEngine.UI;

namespace CityNightRush.UI
{
    public class UIManager : MonoBehaviour
    {
        [Header("Panels (Garage, Settings, Shop, DailyRewards, Upgrade, CustomControls)")]
        public GameObject garagePanel;
        public GameObject settingsPanel;
        public GameObject shopPanel;
        public GameObject dailyRewardsPanel;
        public GameObject upgradePanel;
        public GameObject customControlsPanel;
        public GameObject notEnoughCoinsPopup;

        [Header("CanvasGroup & Dim Background (Alpha 0 -> 0.7)")]
        public CanvasGroup lobbyMainCanvasGroup;
        public CanvasGroup dimBackdropGroup;
        public AudioSource uiAudioSource;
        public AudioClip clickSound;
        public AudioClip upgradeSound;

        private GameObject activePanel;

        private void Awake()
        {
            // Default Car Unlock Logic: CarUnlocked_ApexR1 = 1, others 0
            if (!PlayerPrefs.HasKey("CarUnlocked_ApexR1"))
            {
                PlayerPrefs.SetInt("CarUnlocked_ApexR1", 1);
                PlayerPrefs.SetString("CurrentCar", "Apex R1");
                PlayerPrefs.Save();
            }
        }

        public void OpenPanel(GameObject panel)
        {
            PlayClickSound();
            if (activePanel != null && activePanel != panel)
            {
                activePanel.SetActive(false);
            }

            activePanel = panel;
            if (panel == null) return;

            // Disable background car/UI clicking via CanvasGroup
            if (lobbyMainCanvasGroup != null)
            {
                lobbyMainCanvasGroup.blocksRaycasts = false;
            }
            if (dimBackdropGroup != null)
            {
                dimBackdropGroup.gameObject.SetActive(true);
                StartCoroutine(FadeCanvasGroup(dimBackdropGroup, 0f, 0.7f, 0.2f));
            }

            panel.SetActive(true);
            StopAllCoroutines();
            StartCoroutine(AnimateScaleEaseOutBack(panel.transform, 0.8f, 1.0f, 0.2f));
        }

        public void ClosePanel()
        {
            PlayClickSound();
            if (activePanel == null) return;
            StartCoroutine(ClosePanelRoutine(activePanel));
        }

        public void OnTopLeftBackButtonClicked(Transform backBtnTransform)
        {
            StartCoroutine(PunchButtonScale(backBtnTransform, 0.9f, 0.1f));
            if (activePanel != null)
            {
                ClosePanel();
            }
        }

        public void PlayClickSound()
        {
            if (uiAudioSource != null && clickSound != null && PlayerPrefs.GetInt("CNR_SOUND", 1) == 1)
            {
                uiAudioSource.PlayOneShot(clickSound);
            }
        }

        private IEnumerator AnimateScaleEaseOutBack(Transform target, float from, float to, float duration)
        {
            float elapsed = 0f;
            while (elapsed < duration)
            {
                elapsed += Time.unscaledDeltaTime;
                float t = Mathf.Clamp01(elapsed / duration);
                // easeOutBack cubic-bezier approximation
                float c1 = 1.70158f;
                float c3 = c1 + 1f;
                float ease = 1f + c3 * Mathf.Pow(t - 1f, 3f) + c1 * Mathf.Pow(t - 1f, 2f);
                float s = Mathf.LerpUnclamped(from, to, ease);
                target.localScale = new Vector3(s, s, 1f);
                yield return null;
            }
            target.localScale = Vector3.one * to;
        }

        private IEnumerator ClosePanelRoutine(GameObject panel)
        {
            yield return AnimateScaleEaseOutBack(panel.transform, 1.0f, 0.8f, 0.15f);
            panel.SetActive(false);
            activePanel = null;

            if (dimBackdropGroup != null)
                dimBackdropGroup.gameObject.SetActive(false);
            if (lobbyMainCanvasGroup != null)
                lobbyMainCanvasGroup.blocksRaycasts = true;
        }

        private IEnumerator FadeCanvasGroup(CanvasGroup cg, float from, float to, float duration)
        {
            float elapsed = 0f;
            while (elapsed < duration)
            {
                elapsed += Time.unscaledDeltaTime;
                cg.alpha = Mathf.Lerp(from, to, elapsed / duration);
                yield return null;
            }
            cg.alpha = to;
        }

        private IEnumerator PunchButtonScale(Transform btn, float minScale, float duration)
        {
            btn.localScale = Vector3.one * minScale;
            yield return new WaitForSecondsRealtime(duration);
            btn.localScale = Vector3.one;
        }
    }
}`,
  },
  {
    name: 'RealisticCarPhysicsController.cs',
    desc: 'Fix 1: Zero Auto-Left Drift (18m Road ±9, Smooth Clamp [-8,8], 2s Center Magnet, >0.5s Scrape Cooldown 3s) | Fix 2: 200-400m Ahead Overtake Traffic Only | Fix 3: Flat Road (No Ramps/Jumps)',
    code: `using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Audio;
using CityNightRush.Data;

namespace CityNightRush.Gameplay
{
    [RequireComponent(typeof(Rigidbody))]
    public class RealisticCarPhysicsController : MonoBehaviour
    {
        [Header("1. 16:9 LANDSCAPE LOCKED (1920x1080) & 18M ROAD")]
        public Camera mainCamera;
        public float roadWidth = 18.0f;           // Fix 1c: Increased from 14m to 18m (-9 to +9)
        public float guardrailX = 9.0f;           // Fix 1c: Guardrails at X = -9 and +9
        public float clampRoadX = 8.0f;           // Fix 1d: Smooth Lerp Clamp within [-8, 8]
        public float outOfTrackLimitX = 12.0f;

        [Header("2. RIGIDBODY & PHYSIC MATERIAL (FLAT ROAD - NO JUMPS)")]
        public float carMass = 1550f;
        public float linearDrag = 0.2f;
        public float normalAngularDrag = 1.5f;
        public float accidentAngularDrag = 0.5f;
        public Vector3 centerOfMassOffset = new Vector3(0f, -0.9f, 0.08f);

        [Header("3. MANUAL GAS, BRAKE 5000, SPEED CAP 220 & 16:9 TILT ON/OFF")]
        public bool isControllable = true;
        public bool isTiltOn = false;             // Settings -> Control Type -> Tilt Toggle ON/OFF
        [Range(0f, 100f)] public float tiltSensitivity = 65f; // Default 65%
        public float tiltCalibrationOffsetY = 0f; // Saved by "Calibrate Tilt" button
        public GameObject steeringWheelUI;        // Hidden when Tilt = ON, shown when Tilt = OFF
        public GameObject tiltModeTopBannerUI;    // Shows "TILT MODE - Phone tilt karo" when Tilt = ON
        public float maxMotorTorque = 2850f;
        public float maxBrakeTorque = 5000f;
        public float maxSpeedCapKmh = 220f;
        public float maxSteer = 28f;
        public WheelCollider frontLeftCollider, frontRightCollider, rearLeftCollider, rearRightCollider;

        [Header("4. AHEAD-ONLY OVERTAKE TRAFFIC (200M TO 400M AHEAD)")]
        public GameObject[] trafficCarPrefabs;
        public readonly float[] trafficLanes = new float[] { -6f, -2f, 2f, 6f }; // Fix 2: 4 lanes on 18m road
        private readonly List<Transform> activeTrafficCars = new List<Transform>();
        private float trafficSpawnTimer = 0f;

        [Header("5. CAR DAMAGE & ACCIDENT OUT VISUALS")]
        public Transform frontBonnetMesh;
        public GameObject crackedWindshieldOverlay;
        public GameObject redFlashOverlay;
        public Light[] headlights;
        public ParticleSystem bonnetSmokeParticle, bumperSparkParticle, glassBreakParticle, sideWallSparkParticle;
        public AudioSource engineSource, tyreScreechSource, crashSource, glassBreakSource;

        private Rigidbody rb;
        public bool isAccident = false;
        private bool gasButtonPressed = false;
        private bool brakeButtonPressed = false;
        private bool leftArrowPressed = false;
        private bool rightArrowPressed = false;
        private float currentSteer = 0f;
        private float noSteerInputTimer = 0f;     // Fix 1b: Only apply center force if no input for 2 sec
        private float wallTouchTimer = 0f;        // Fix 1e: Must touch > 0.5 sec at speed > 30
        private float scrapeCooldownTimer = 0f;   // Fix 1e: 3 sec scrape cooldown
        private float currentRpm = 1000f;
        private readonly List<float> recentAccidentTimes = new List<float>();

        public float CurrentSpeedKmh => rb != null ? rb.linearVelocity.magnitude * 3.6f : 0f;

        private void Awake()
        {
            // Fix 4: Keep 16:9 Locked (1920x1080 LandscapeLeft)
            Screen.orientation = ScreenOrientation.LandscapeLeft;
            Screen.SetResolution(1920, 1080, true);
            Application.targetFrameRate = 60;
            if (mainCamera != null) mainCamera.fieldOfView = 75f;

            // Fix 3: Disable any jump ramps in scene - keep road 100% flat
            foreach (var ramp in GameObject.FindGameObjectsWithTag("Ramp"))
                ramp.SetActive(false);

            SetTiltMode(isTiltOn);
            ConfigureRigidbodyAndRoadWalls();
        }

        // 1) & 4) Settings -> Control Type -> Tilt Toggle ON/OFF & UI update
        public void SetTiltMode(bool enableTilt)
        {
            isTiltOn = enableTilt;
            if (steeringWheelUI != null) steeringWheelUI.SetActive(!isTiltOn);
            if (tiltModeTopBannerUI != null) tiltModeTopBannerUI.SetActive(isTiltOn);
        }

        // 5) Calibration Button: Save current 16:9 phone position = 0 center
        public void CalibrateTilt()
        {
            tiltCalibrationOffsetY = Input.acceleration.y;
            PlayerPrefs.SetFloat("CNR_TILT_CALIBRATION_Y", tiltCalibrationOffsetY);
            PlayerPrefs.Save();
        }

        public void OnGasPointerDown() => gasButtonPressed = true;
        public void OnGasPointerUp() => gasButtonPressed = false;
        public void OnBrakePointerDown() => brakeButtonPressed = true;
        public void OnBrakePointerUp() => brakeButtonPressed = false;
        public void OnLeftArrowPointerDown() => leftArrowPressed = true;
        public void OnLeftArrowPointerUp() => leftArrowPressed = false;
        public void OnRightArrowPointerDown() => rightArrowPressed = true;
        public void OnRightArrowPointerUp() => rightArrowPressed = false;

        public void ConfigureRigidbodyAndRoadWalls()
        {
            rb = GetComponent<Rigidbody>();
            rb.mass = carMass;
            rb.linearDamping = linearDrag;
            rb.angularDamping = normalAngularDrag;
            rb.interpolation = RigidbodyInterpolation.Interpolate;
            rb.collisionDetectionMode = CollisionDetectionMode.ContinuousDynamic;
            rb.centerOfMass = centerOfMassOffset;

            // Fix 1c: Guardrail Box Colliders at X = -9 and X = +9 (18m Road Width)
            PhysicsMaterial wallMat = new PhysicsMaterial("RoadWallMat")
            {
                bounciness = 0.2f,
                dynamicFriction = 0.8f,
                staticFriction = 0.8f
            };
            CreateInvisibleSideWall("LeftGuardrail", -guardrailX, wallMat);
            CreateInvisibleSideWall("RightGuardrail", guardrailX, wallMat);
        }

        private void CreateInvisibleSideWall(string wallName, float xPos, PhysicsMaterial mat)
        {
            GameObject wall = new GameObject(wallName);
            wall.tag = "SideWall";
            wall.transform.position = new Vector3(xPos, 1f, 0f);
            BoxCollider bc = wall.AddComponent<BoxCollider>();
            bc.size = new Vector3(0.5f, 2f, 2000f);
            bc.sharedMaterial = mat;
        }

        private void FixedUpdate()
        {
            if (isAccident || !isControllable) return;

            float dt = Time.fixedDeltaTime;
            float speedKmh = CurrentSpeedKmh;
            if (scrapeCooldownTimer > 0f) scrapeCooldownTimer -= dt;

            // Manual Gas & Brake 5000 + 220 km/h speed cap
            float motorInput = (Input.GetKey(KeyCode.W) || Input.GetKey(KeyCode.UpArrow) || gasButtonPressed) ? 1f : 0f;
            bool isBraking = Input.GetKey(KeyCode.S) || Input.GetKey(KeyCode.DownArrow) || Input.GetKey(KeyCode.Space) || brakeButtonPressed;

            float brakeTorque = isBraking ? maxBrakeTorque : 0f;
            float motorTorque = (isBraking || speedKmh >= maxSpeedCapKmh) ? 0f : motorInput * maxMotorTorque;

            rearLeftCollider.motorTorque = motorTorque;
            rearRightCollider.motorTorque = motorTorque;
            frontLeftCollider.brakeTorque = brakeTorque;
            frontRightCollider.brakeTorque = brakeTorque;
            rearLeftCollider.brakeTorque = brakeTorque;
            rearRightCollider.brakeTorque = brakeTorque;

            // 1), 2), 3) Tilt ON/OFF for 16:9 Landscape (LandscapeLeft)
            float steerInput = 0f;
            if (isTiltOn)
            {
                // If Tilt = ON: steerInput = tiltSteer ONLY (buttons hidden), 16:9 mapping use karo
                float rawX = Input.acceleration.x;
                float rawY = Input.acceleration.y - tiltCalibrationOffsetY;
                // 16:9 landscape me phone 90 deg ghuma hai, isliye left-right ke liye Y use karo, X nahi:
                float tiltSteer = -rawY * 2.0f;
                tiltSteer = Mathf.Clamp(tiltSteer, -1f, 1f);
                // Dead zone 0.12f taaki halke hilne par left na jaye:
                if (Mathf.Abs(tiltSteer) < 0.12f) tiltSteer = 0f;
                // Tilt Sensitivity 0-100% (default 65%):
                tiltSteer = Mathf.Clamp(tiltSteer * (tiltSensitivity / 50f), -1f, 1f);
                steerInput = tiltSteer;

                if (Mathf.Abs(steerInput) < 0.12f) noSteerInputTimer += dt;
                else noSteerInputTimer = 0f;
            }
            else
            {
                // If Tilt = OFF: steerInput = buttonSteer ONLY, Input.acceleration = ignore (0)
                float axisH = Input.GetAxisRaw("Horizontal");
                bool leftHeld = leftArrowPressed || Input.GetKey(KeyCode.LeftArrow) || Input.GetKey(KeyCode.A);
                bool rightHeld = rightArrowPressed || Input.GetKey(KeyCode.RightArrow) || Input.GetKey(KeyCode.D);

                if (Mathf.Abs(axisH) < 0.01f && !leftHeld && !rightHeld)
                {
                    steerInput = 0f;
                    noSteerInputTimer += dt;
                }
                else
                {
                    steerInput = leftHeld ? -1f : (rightHeld ? 1f : axisH);
                    noSteerInputTimer = 0f;
                }
            }

            float targetSteer = (Mathf.Abs(steerInput) < 0.1f || speedKmh <= 10f) ? 0f : steerInput;
            currentSteer = Mathf.Lerp(currentSteer, targetSteer, dt * 3f);
            if (steerInput == 0f && Mathf.Abs(currentSteer) < 0.01f) currentSteer = 0f;

            float steerAngle = maxSteer * currentSteer * Mathf.Max(0.15f, 1f - speedKmh / 250f);
            frontLeftCollider.steerAngle = steerAngle;
            frontRightCollider.steerAngle = steerAngle;

            // Fix 1b: Road center magnet OFF when player steering - only apply if no input for 2 sec
            Vector3 pos = transform.position;
            if (noSteerInputTimer >= 2.0f && Mathf.Abs(pos.x) > 5.0f && speedKmh > 5f)
            {
                rb.AddForce(Vector3.right * (-pos.x * 50f), ForceMode.Force);
            }

            // Fix 1d: Smooth Lerp Clamp to [-8, 8] (no instant scrape loop)
            if (Mathf.Abs(pos.x) > clampRoadX)
            {
                float targetClampX = Mathf.Clamp(pos.x, -clampRoadX, clampRoadX);
                pos.x = Mathf.Lerp(pos.x, targetClampX, dt * 10f);
            }
            // Fix 3: Keep road 100% flat (y locked, no vertical jump force or barrel roll)
            transform.position = new Vector3(pos.x, 0f, pos.z);

            // Fix 1e: Only trigger scrape if speed > 30 and touching near guardrail for > 0.5 sec, with 3 sec cooldown
            if (Mathf.Abs(pos.x) >= 7.92f && speedKmh > 30f)
            {
                wallTouchTimer += dt;
                if (wallTouchTimer > 0.5f && scrapeCooldownTimer <= 0f)
                {
                    rb.linearVelocity *= 0.7f; // -30% speed once
                    sideWallSparkParticle?.Play();
                    scrapeCooldownTimer = 3.0f;
                    wallTouchTimer = 0f;
                }
            }
            else
            {
                wallTouchTimer = 0f;
            }

            // Fix 2: Update Ahead-Only Overtake Traffic (200m to 400m ahead, despawn 100m behind)
            UpdateOvertakeTraffic(dt, speedKmh);
        }

        private void UpdateOvertakeTraffic(float dt, float playerSpeedKmh)
        {
            float playerZ = transform.position.z;
            float nearestAheadDist = float.MaxValue;

            for (int i = activeTrafficCars.Count - 1; i >= 0; i--)
            {
                Transform tCar = activeTrafficCars[i];
                if (tCar == null) { activeTrafficCars.RemoveAt(i); continue; }

                // Traffic moves in SAME direction at playerSpeed - Random(20, 40) so player overtakes them
                float botSpeedKmh = Mathf.Max(40f, playerSpeedKmh - 30f);
                tCar.position += Vector3.forward * ((botSpeedKmh / 3.6f) * dt);

                float distAhead = tCar.position.z - playerZ;
                if (distAhead > 0f && distAhead < nearestAheadDist)
                    nearestAheadDist = distAhead;

                // Despawn when traffic car is 100m behind player (never let it chase from behind)
                if (playerZ - tCar.position.z > 100f)
                {
                    Destroy(tCar.gameObject);
                    activeTrafficCars.RemoveAt(i);
                }
            }

            // Every 3 sec, check distance to next traffic car; if > 150m, spawn ahead at 200m..400m in lane [-6, -2, 2, 6]
            trafficSpawnTimer += dt;
            if (trafficSpawnTimer >= 3.0f)
            {
                trafficSpawnTimer = 0f;
                if (nearestAheadDist > 150f && trafficCarPrefabs != null && trafficCarPrefabs.Length > 0)
                {
                    float laneX = trafficLanes[Random.Range(0, trafficLanes.Length)];
                    float spawnZ = playerZ + Random.Range(200f, 400f);
                    GameObject prefab = trafficCarPrefabs[Random.Range(0, trafficCarPrefabs.Length)];
                    GameObject spawned = Instantiate(prefab, new Vector3(laneX, 0f, spawnZ), Quaternion.identity);
                    activeTrafficCars.Add(spawned.transform);
                }
            }
        }
    }
}`,
  },
  {
    name: 'CarStatsSO.cs',
    desc: 'ScriptableObject for the 10 Real-World Vehicles (Apex R1 Ferrari F8, Vortex Blue Jaguar F-Type, Nova Yellow Huracan, etc.)',
    code: `using UnityEngine;

namespace CityNightRush.Data
{
    public enum VehicleClass { Supercar, ConvertibleGT, SUV, Offroad4x4, Sedan, Truck, Bus, Sports, Hypercar }

    [CreateAssetMenu(fileName = "NewCarStats", menuName = "CityNightRush/Car Stats ScriptableObject")]
    public class CarStatsSO : ScriptableObject
    {
        public string carId = "apex_r1";
        public string displayName = "Apex R1";
        public string realWorldModel = "Ferrari F8 Tributo 2023";
        public string indianNumberPlate = "MH 12 XR 8847";
        public VehicleClass vehicleClass = VehicleClass.Supercar;
        public GameObject carPrefab;

        [Header("Base Performance")]
        public float baseTopSpeedKmh = 340f;
        public float baseMotorTorque = 2850f;
        public float baseSteerAngle = 32f;
        public float baseLateralGrip = 1.95f;
        public float baseNitroDuration = 5.5f;

        [Header("Default Upgrade Levels (1-10)")]
        [Range(1, 10)] public int defaultEngineLevel = 4;
        [Range(1, 10)] public int defaultTurboLevel = 3;
        [Range(1, 10)] public int defaultTiresLevel = 3;
        [Range(1, 10)] public int defaultNitroLevel = 2;

        [Header("Shop Unlock")]
        public bool unlockedByDefault = true;
        public int priceCoins = 0;
        public int priceDiamonds = 0;
    }
}`,
  },
  {
    name: 'MultiplayerPUN2Manager.cs',
    desc: 'Photon PUN 2 FREE Lobby (1-5 Players, 4-Digit Room Code like 4829, 5 Car Slots + Ready, Start Line X = -6,-3,0,3,6, 2000m Finish + 5000 Coins + Crown)',
    code: `using System.Collections.Generic;
using System.Linq;
using UnityEngine;
using UnityEngine.UI;
using Photon.Pun;
using Photon.Realtime;
using ExitGames.Client.Photon;

namespace CityNightRush.Multiplayer
{
    public class MultiplayerPUN2Manager : MonoBehaviourPunCallbacks
    {
        [Header("16:9 Multiplayer Room UI (1-5 Players)")]
        public InputField joinCodeInput;
        public Text roomCodeLabel;
        public GameObject[] slotPanels; // 5 Car Slots
        public Button startRaceButton;  // Host Only
        public Text livePositionTopText;
        public GameObject finishResultPanel;
        public Text finishRankingText;

        // Spawn 5 cars at start line: positions X = -6, -3, 0, 3, 6 same Z = 0
        public static readonly float[] START_LINE_X = new float[] { -6f, -3f, 0f, 3f, 6f };
        public const float FINISH_DISTANCE_Z = 2000f; // 2000m (2km) Race Distance

        private void Start()
        {
            PhotonNetwork.AutomaticallySyncScene = true;
            PhotonNetwork.ConnectUsingSettings();
        }

        // [ CREATE ROOM ] -> 4-digit room code (like 4829), MaxPlayers = 5
        public void CreateRoom4Digit()
        {
            string code = Random.Range(1000, 9999).ToString();
            RoomOptions opts = new RoomOptions
            {
                MaxPlayers = 5,
                IsVisible = true,
                IsOpen = true
            };
            PhotonNetwork.CreateRoom(code, opts);
        }

        // [ JOIN ROOM ] -> Enter 4-digit code
        public void JoinRoomByCode()
        {
            string code = joinCodeInput != null ? joinCodeInput.text.Trim() : "4829";
            if (code.Length == 4)
            {
                PhotonNetwork.JoinRoom(code);
            }
        }

        public override void OnJoinedRoom()
        {
            if (roomCodeLabel != null)
                roomCodeLabel.text = "ROOM CODE: " + PhotonNetwork.CurrentRoom.Name;

            Hashtable props = new Hashtable { { "IsReady", PhotonNetwork.IsMasterClient } };
            PhotonNetwork.LocalPlayer.SetCustomProperties(props);
        }

        public void ToggleReady()
        {
            bool cur = PhotonNetwork.LocalPlayer.CustomProperties.ContainsKey("IsReady") &&
                       (bool)PhotonNetwork.LocalPlayer.CustomProperties["IsReady"];
            PhotonNetwork.LocalPlayer.SetCustomProperties(new Hashtable { { "IsReady", !cur } });
        }

        public void HostStartRace()
        {
            if (!PhotonNetwork.IsMasterClient) return;
            PhotonNetwork.CurrentRoom.IsOpen = false;
            photonView.RPC(nameof(RPC_Spawn5CarsAtStartLine), RpcTarget.All);
        }

        [PunRPC]
        private void RPC_Spawn5CarsAtStartLine()
        {
            Player[] players = PhotonNetwork.PlayerList;
            int myIndex = System.Array.IndexOf(players, PhotonNetwork.LocalPlayer);
            if (myIndex < 0) myIndex = 0;

            float spawnX = START_LINE_X[Mathf.Clamp(myIndex, 0, 4)];
            Vector3 startPos = new Vector3(spawnX, 0f, 0f);
            string carPrefabName = PlayerPrefs.GetString("CurrentCar", "Apex R1");
            PhotonNetwork.Instantiate(carPrefabName, startPos, Quaternion.identity);
        }
    }
}`,
  },
  {
    name: 'PhotonCarSync.cs',
    desc: 'photonView.IsMine Check, PhotonTransformView Sync, Name Tag Above Car, 10s Ghost Collision + 10% Damage, & Horn Taunt ("Peeee!" + Emoji)',
    code: `using UnityEngine;
using UnityEngine.UI;
using Photon.Pun;

namespace CityNightRush.Multiplayer
{
    [RequireComponent(typeof(PhotonView), typeof(PhotonTransformView))]
    public class PhotonCarSync : MonoBehaviourPun
    {
        public CarController localCarController;
        public Text floatingNameTagText;
        public Text hornTauntBubbleText;
        public AudioSource hornAudioSource;
        public Collider carCollider;

        private float raceStartTime;
        private float lastPlayerBumpTime;
        private bool finished2000m;

        private void Start()
        {
            raceStartTime = Time.time;

            // Each player controls ONLY his own car (photonView.IsMine check)
            if (photonView.IsMine)
            {
                localCarController.enabled = true;
                if (floatingNameTagText != null)
                    floatingNameTagText.text = "Player " + PhotonNetwork.LocalPlayer.ActorNumber + " (You)";
            }
            else
            {
                localCarController.enabled = false;
                if (floatingNameTagText != null)
                    floatingNameTagText.text = "Player " + photonView.Owner.ActorNumber;
            }
        }

        private void Update()
        {
            if (!photonView.IsMine) return;

            // Win System: 2000m (2km) Finish Line
            if (!finished2000m && transform.position.z >= 2000f)
            {
                finished2000m = true;
                photonView.RPC(nameof(RPC_PlayerFinished2000m), RpcTarget.AllBuffered, PhotonNetwork.LocalPlayer.ActorNumber);
            }
        }

        // Photon Chat Taunt: Voice OFF, only Horn button ("Peeee") + Emoji
        public void PressHornTaunt(string emoji = "📯")
        {
            if (!photonView.IsMine) return;
            photonView.RPC(nameof(RPC_PlayHornTaunt), RpcTarget.All, emoji);
        }

        [PunRPC]
        private void RPC_PlayHornTaunt(string emoji)
        {
            if (hornAudioSource != null) hornAudioSource.Play();
            if (hornTauntBubbleText != null)
            {
                hornTauntBubbleText.gameObject.SetActive(true);
                hornTauntBubbleText.text = "Peeee! " + emoji;
                CancelInvoke(nameof(HideHornBubble));
                Invoke(nameof(HideHornBubble), 2.5f);
            }
        }

        private void HideHornBubble()
        {
            if (hornTauntBubbleText != null)
                hornTauntBubbleText.gameObject.SetActive(false);
        }

        private void OnCollisionEnter(Collision collision)
        {
            if (!photonView.IsMine) return;
            if (!collision.gameObject.CompareTag("PlayerCar")) return;

            // Ghost collision between real players for first 10 sec
            if (Time.time - raceStartTime < 10f)
            {
                Physics.IgnoreCollision(carCollider, collision.collider, true);
                return;
            }

            // After 10 sec: enable collision but ONLY 10% speed damage (no rear accident bug)
            if (Time.time - lastPlayerBumpTime > 2.5f)
            {
                lastPlayerBumpTime = Time.time;
                Rigidbody rb = GetComponent<Rigidbody>();
                if (rb != null) rb.velocity *= 0.90f; // -10% speed only
            }
        }

        [PunRPC]
        private void RPC_PlayerFinished2000m(int actorNumber)
        {
            // First player to reach 2000m gets 1st Position + 5000 Coins + Crown
            if (photonView.IsMine)
            {
                int coins = PlayerPrefs.GetInt("Coins", 230500);
                PlayerPrefs.SetInt("Coins", coins + 5000);
                PlayerPrefs.Save();
            }
        }
    }
}`,
  },
];

export const UnityScriptsModal: React.FC<UnityScriptsModalProps> = ({ onClose }) => {
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(UNITY_FILES[selectedIdx].code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4 animate-backdrop-dim"
      onClick={onClose}
    >
      <div
        className="panel-glass rounded-2xl w-full max-w-4xl max-h-[88vh] flex flex-col border border-indigo-400/40 shadow-2xl overflow-hidden animate-popup-open"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-3.5 border-b border-white/10 bg-slate-900/90">
          <div>
            <h2 className="font-display font-bold text-base sm:text-lg text-white tracking-wider uppercase">
              Unity (C# URP) UIManager.cs & Realistic Physics Scripts
            </h2>
            <p className="text-xs text-slate-400">
              Includes UIManager.cs (OpenPanel, ClosePanel, PlayClickSound, easeOutBack 0.2s) & WheelCollider Physics
            </p>
          </div>
          <button
            onClick={onClose}
            className="btn-punch px-3 py-1.5 rounded-lg bg-white/10 hover:bg-rose-500/80 text-white font-bold text-sm cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Active Unity Rigidbody & WheelCollider Setup Inspector Banner */}
        <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 px-6 py-2.5 bg-indigo-950/50 border-b border-indigo-400/25 text-[11px] font-hud">
          <div className="bg-slate-900/80 px-2.5 py-1 rounded border border-white/10">
            <span className="text-slate-400 block">Mass / CoM.y</span>
            <span className="text-amber-400 font-bold">
              {DEFAULT_RIGIDBODY_SETUP.mass}kg / {DEFAULT_RIGIDBODY_SETUP.centerOfMass.y}
            </span>
          </div>
          <div className="bg-slate-900/80 px-2.5 py-1 rounded border border-white/10">
            <span className="text-slate-400 block">Wheel Spring</span>
            <span className="text-sky-400 font-bold">{DEFAULT_RIGIDBODY_SETUP.wheelSpring}</span>
          </div>
          <div className="bg-slate-900/80 px-2.5 py-1 rounded border border-white/10">
            <span className="text-slate-400 block">Wheel Damper</span>
            <span className="text-sky-400 font-bold">{DEFAULT_RIGIDBODY_SETUP.wheelDamper}</span>
          </div>
          <div className="bg-slate-900/80 px-2.5 py-1 rounded border border-white/10">
            <span className="text-slate-400 block">Friction Stiff</span>
            <span className="text-emerald-400 font-bold">{DEFAULT_RIGIDBODY_SETUP.frictionStiffness}</span>
          </div>
          <div className="bg-slate-900/80 px-2.5 py-1 rounded border border-white/10">
            <span className="text-slate-400 block">Downforce</span>
            <span className="text-emerald-400 font-bold">{DEFAULT_RIGIDBODY_SETUP.downforceFactor} * vel</span>
          </div>
          <div className="bg-slate-900/80 px-2.5 py-1 rounded border border-white/10">
            <span className="text-slate-400 block">Collision</span>
            <span className="text-purple-300 font-bold">{DEFAULT_RIGIDBODY_SETUP.collisionDetection}</span>
          </div>
        </div>

        {/* File Tabs */}
        <div className="flex items-center gap-2 px-6 py-2.5 bg-slate-950/70 border-b border-white/10 overflow-x-auto">
          {UNITY_FILES.map((file, idx) => (
            <button
              key={file.name}
              onClick={() => setSelectedIdx(idx)}
              className={`btn-punch px-3.5 py-1.5 rounded-lg font-hud font-bold text-xs whitespace-nowrap transition-all cursor-pointer ${
                selectedIdx === idx
                  ? 'bg-indigo-600 text-white shadow'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {file.name}
            </button>
          ))}
        </div>

        {/* Code Viewer */}
        <div className="p-5 overflow-y-auto flex-1 bg-slate-950/90 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-indigo-300">
              {UNITY_FILES[selectedIdx].desc}
            </span>
            <button
              onClick={handleCopy}
              className="btn-punch px-3 py-1 rounded-lg bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-400/40 text-xs font-hud font-bold text-indigo-200 cursor-pointer"
            >
              {copied ? 'Copied C# Script ✓' : 'Copy C# Script'}
            </button>
          </div>
          <pre className="p-4 rounded-xl bg-slate-900 border border-white/10 text-xs font-mono text-slate-200 overflow-x-auto leading-relaxed select-text">
            {UNITY_FILES[selectedIdx].code}
          </pre>
        </div>
      </div>
    </div>
  );
};
