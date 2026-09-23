# Locomotion capture provenance

The walk and run direction tracks are retargeted from the Carnegie Mellon University Graphics Lab Motion Capture Database. They are **not extracted Genshin Impact animations**.

- Database and use terms: https://mocap.cs.cmu.edu/
- Official subject/trial listing: https://mocap.cs.cmu.edu/search.php?subjectnumber=35
- Skeleton: https://mocap.cs.cmu.edu/subjects/35/35.asf
- Walking, 120 Hz: https://mocap.cs.cmu.edu/subjects/35/35_01.amc
- Running/jogging, 120 Hz: https://mocap.cs.cmu.edu/subjects/35/35_17.amc
- Retrieved 2026-09-12. Original text data preserved beside this file.

The database states that its motion data is free for all uses, including use inside commercially sold products, but raw motion data may not be resold directly, including converted forms. This local scene is not a motion-data resale product.

Required acknowledgment: The data used in this project was obtained from mocap.cs.cmu.edu. The database was created with funding from NSF EIA-0196217.

Processing: ASF/AMC forward kinematics remove the recorded world trajectory and heading. One steady complete cycle is sampled into 64 poses. Unit limb directions are retargeted to Varesa's existing PMX proportions and control bones, preserving the official model and its grant/deformation-bone relationships. Root translation remains controlled by the scene. Hip motion is kept small; no full-body foot-target solver is used to force the character into a permanent crouch.

Visual target/reference: Genshin Impact Official, “Collected Miscellany — Varesa: Hero Incoming!”, https://www.hoyolab.com/article/37760975 ; corrected official video https://youtu.be/BWocur7kWXY . The reference is used for presentation direction and is not the source of the included motion data.
