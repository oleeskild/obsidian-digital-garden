---
{"dg-publish":true,"permalink":"/notes-pro/travail/hmi-livrable-aps/","tags":["HMI","PRO"]}
---


 > [!Quote] Extrait Note Hypothèse IGH
 > 
> 1.     CLASSEMENT DES OUVRAGES
> 
> Au sens de l’EN 1990, les hypothèses de calcul en matière de fiabilité structurale sont décrites ci-dessous.
> 
> **1.1**           **CLASSE DE CONSEQUENCE (EN 1990 ANNEXE  INFORMATIVE B.3)**
> 
> Le projet consiste en un établissement hospitalier composé  d’une tour centrale  IGH R+40  et deux ailes IGH R+9.
> 
> ==En ce référant à l'**EN 1991-1-7 §A** toutes les composantes hospitalières dépassent R+3 (3 niveaux) et sont à considérer en classe de conséquence CC3== 
>
>==Selon l'EN 1990 §2-3 la catégorie de durée d’utilisation de projet est prise égale à S4, correspondant à une durée indicative d’utilisation de projet de 50 ans==
> 
> |   |   |   |   |   |
> |---|---|---|---|---|
> |Composantes|Classe de conséquence|Classe de fiabilité|β (Durée 50 ans)|==KF1==|
> |Hôpital ==4 niveaux et +== |CC3|RC3|4.3|==1.1==|
> 
> Le coefficient KF1 sera appliqué uniquement aux combinaisons ELU
> 
> ·       ==Niveau de contrôle : **Normal (DSL 2)** - Contrôle interne croisé réalisé par des personnes **différentes** de celles ayant réalisé le calcul initial, mais appartenant à la **même organisation**.==
> 
> ·       ==Niveau d'inspection lors de l'exécution : **Normal (IL 2)** - **Contrôle par tierce partie** : La vérification est effectuée par un organisme totalement indépendant de celui qui a préparé le projet==
> 
> 
> **NOTA :**
> 
> ~~Le reclassement de l’ouvrage de la classe de conséquence CC3 vers la classe CC2 peut être envisagé , sous réserve de l’accord formel du maître d’ouvrage et du bureau de contrôle, conformément aux dispositions de l’EN 1990 – Bases de calcul des structures, ce reclassement doit faire l’objet d’une justification technique rigoureuse. Celle-ci repose sur la démonstration argumentée d’une réduction effective et mesurable des conséquences d’une défaillance structurelle, tant sur le plan humain, économique que sociétal.~~
> 
> ~~Cette requalification peut être étayée par la mise en œuvre d’une démarche de fiabilisation renforcée, incluant notamment des procédures accrues de vérification indépendante des hypothèses de calcul, de double modélisation et de recalcul des ouvrages, ainsi que des contrôles techniques approfondis à chaque phase du projet, visant à réduire significativement les risques d’erreur de conception et d’exécution.~~  **NON à remplacer par le texte ci-dessous**  

> [!INFO] Explications
> La classe de conséquence et le niveau de fiabilité ne peuvent pas être modifié
> On peut soit majorer les efforts, soit minorer les résistance, soit ET adopter un contrôle et des étude et une supervision des travaux étendue
> On ne pénalise pas tous les hopitaux, de part leur nature, avec à la fois KFi/DSL3/IL3 mais il est possible que le bureau de contrôle pousse pour des dispositions plus pénalisante en IGH40 par exemple controle VISA LUSEO avec contre calcul ?

> [!TIP]   Remplacement proposé
> Les niveaux de contrôle des études d'exécution et de supervision de travaux correspondant à **DSL3 - Contrôle Etendu des études d'exécution par tierce partie** et **IL3 - Inspection des travaux par tierce partie** sont à prendre en compte par l'entreprise qui développera une note organisationnelle afin d'atteindre l'objectif de compenser la majoration "simple et couteuse" des dimensionnements par les coefficients KFi 

> [!Quote]
>  Les actions accidentelles non identifiées visent à limiter l’étendue d’une défaillance locale seront prises en compte en adoptant la méthode des tirants horizontaux définie en A.5.1 et A.5.2, ainsi que des tirants verticaux, définie en A.6.

A mettre dans un paragraphe séparé et plus détaillé

> [!TIP]   Remplacement proposé
> ## Robustesse des structures
>
>Les dispositions constructives et les méthodes d'analyse sont retenues en référence à l'**EN1990-1-7** pour garantir l'intégrité structurelle de l'ouvrage et prévenir tout effondrement disproportionné suite à une défaillance locale d'origine accidentelle.
>
> #### Ailes IGH R+9 : Méthode Prescriptive
>
> Pour ces bâtiments, la robustesse repose sur le respect de dispositions constructives forfaitaires détaillées dans l'Annexe A.
>
>- **Tirants Horizontaux (A.5) :**
>     
>     - Mise en place de chaînages continus intérieurs (§ A.5.1) et périphériques (§ A.5.2).
>         
>     - **Objectif** : Assurer l'intégrité de la dalle et permettre un report de charge par effet de membrane en cas de perte d'appui.
>         
> - **Tirants Verticaux (A.6) :**
>     
>     - Installation d'armatures de traction continues dans chaque poteau et mur porteur.
>         
>     - **Objectif** : Garantir la suspension des planchers vers les niveaux supérieurs en cas de défaillance d'un porteur en pied.
>         
> 
> 
> #### Tour Centrale IGH R+40 : Méthodes Avancées
> 
> En raison de la hauteur de l'ouvrage, l'approche dépasse les simples tirants pour valider la stabilité par le calcul.
> 
> - **Analyse du Chemin Alternatif (A.7) :**
>     
>     - Simulation numérique de la suppression d'un élément porteur vital (ex: poteau de rive).
>         
>     - Vérification que l'effondrement localisé ne dépasse pas **15% de la surface du plancher** ou **100 $m^2$** sur deux niveaux successifs.
>         
> - **Conception des Éléments Clés (A.8) :**
>     
>     - Si le chemin alternatif n'est pas vérifié, le porteur est classé "Élément Clé "et devra se conformer à l'exigence de résistance à une charge d'explosion accidentelle conventionnelle
>         
>     - **Exigence** : Calcul de l'élément pour résister à une pression accidentelle conventionnelle de **34 kPa** appliquée de manière multidirectionnelle

> [!Quote] Extrait Note d'hypothèse générale IGH
> La température du béton lors du bétonnage doit également satisfaire aux exigences thermiques suivantes, afin de maîtriser les risques de fissuration et d’assurer la durabilité de l’ouvrage :
> 
> - **Écart de température entre le cœur et le parement ≤ 20 °C**, afin de limiter les contraintes thermiques superficielles et prévenir la fissuration de parement.
> - **Température maximale au cœur du béton ≤ 65 °C conformément au DTU21.5.3.5 et la norme XP ENV 13670-1 article 8.5(8)**, dans le but d’éviter les fissurations liées au refroidissement différentiel ainsi que le développement de pathologies internes, notamment les réactions sulfatiques internes.
> - **Différence de température entre éléments adjacents (levée en cours de coulage et levée précédente) ≤ 20 °C**, afin de réduire les contraintes de compatibilité thermique et limiter le risque de fissuration traversante à l’interface des levées.

> [!INFO] A developper
> Je ne comprends pas d'ou viennent ces spécifications ? quelles sont les références règlementaires ?
> T<65°C est pour limiter le risque de RSI (ettringite différée) et ne doit pas être spécifié par luseo car peut être contrôlé par la nature du ciment également (sensibilité au sulfate) et dans le cas d'un point de vue opératoire (température des constituants, retardateur de prise, isolation, cure et proteciton solaire en fonction des conditions amiantes ...) 
> 
> par contre il ne faut pas oublier de cadrer les objectifs et la base règlementaire sinon on va avoir du mal a faire des VISA, notamment si on souhaite imposer des vérifications spécifiques (échantillon de test préalable, thermocouple dans le radier, analyse thermo-hydro-chemo-mécanique de la fissuration en dérivation du temps avec conditions aux limites pour estimer la température du noyau et estimer le développement de la fissuration dans les 20 1er jours ...)
> 
> le dernier point entre 2 coulages ca peut être imposé dans le cas de reprise sur les radiers massifs en complément du traitement de la rugosité justifié par dispositif ou procédure, et renforcement des armatures vis-à-vis de tous les efforts tranchants y compris rasants dans tous les plans d'interface
> 
> Je vous laisse développer

> [!Quote] **Les tassements prévisibles**
·       
>  ~~Les tassements engendrés par les cas de charges sont jugés admissibles par le rapport du sol.~~ <font color="#2DC26B">La vérification en tassement admissible</font> sera effectuée en tenant compte des raideurs du sol <font color="#2DC26B">et de la montée séquentielle progressive des charges du bâtiment si le tassement est réputé non linéaire, avec pour limites minimales :</font>.
> 
> Pour le tassement relatif : 1/500 selon **EC2 AN § 2.6.**
> 
> Pour le tassement global : 50 mm selon **EC7 Annexe H (b).**
>
><font color="#2DC26B">En attendant la résolution de modèle séquentiel pour vérification de la fonctionnalité des façades et des équipements médicaux il est prudent, sauf disposition spécifique sur les technologies, de conserver des valeurs plus pessimistes au démarrage</font>
>
> <font color="#2DC26B">> </font>
> <font color="#2DC26B">> Pour le tassement relatif : 1/750 selon </font>
> <font color="#2DC26B">> </font>
> <font color="#2DC26B">> Pour le tassement global : 30 mm selon </font>
> <font color="#2DC26B">> </font>
> 



> [!Quote] Extrait note d'ypothèse IGH
> 
> 1.1           CHARGE DE LA FACADE
> 
> ·       **Principe de la façade IGHR +40 :**
> 
> La structure des façades, conçue sous forme de boîtes, sera réalisée en charpente métallique. Elle sera directement fixée sur les poteaux principaux en béton armé. Par la suite, des poutres solives viendront s’y accrocher afin de supporter un plancher collaborant.
> 
> v  **Principe de modélisation :**
> 
> La modélisation de l’ouvrage sera faite sur le logiciel ROBOT BAT.  Le modèle sera  développé pour intégrer :
> 
> -        Un modèle tenant compte des charges dues au vent ;
> 
> -        Un modèle intégrant le spectre de calcul horizontal, établi à partir de l’accélération sismique horizontale et longitudinale générée au niveau des planchers concernés.
> 
> **NB :** Les résultats de calcul  seront ensuite intégrés dans le modèle global de la tour IGHR40 pour prise en compte dans l’analyse générale.
> 
> **•          Principe de la façade IGHR09**
> 
> Les façades des IGH R+9 sont réalisées avec un système d’isolation thermique par l’extérieur (ITE). Deux types de finitions sont prévus : un revêtement en pierre naturelle et un revêtement en panneaux en fibres-ciment.
> 
> Le système porteur associé aux façades se compose de voiles en béton armé pour les façades courantes et de poteaux/chaînages en maçonnerie d’agglos pour les façades en retrait.
> 
> Les charges correspondant à chaque type de façade et à chaque configuration structurelle ont été prises en compte et sont présentées dans le plan de chargement

> [!warning] Important
> Je comprends pas ce paragraphe concernant les charges de façade et qui traite la méthode de modélisation des boites structurelles support de façade
> Il faut spécifier les charges de la façade
> 

> [!Quote] Extrait note d'ypothèse IGH
> 
> ## PRINCIPE DE MODELISATION
> 
> La modélisation de l’ouvrage sera faite sur les logiciels CSI ETABS, ROBOT STRUCTURAL ANALYSIS et/ou SOFISTIK pour l’IGHR+40 <font color="#2DC26B">et </font>les l’IGHR+9. **<font color="#2DC26B">Pour l'IGH 40 il sera procédé pour chaque modélisation d'analyse décrite ci-après : un modèle primaire et un modèle de contre-calcul qui devront être bouclés en concordance de résultats  par une note spécifique interne à l'entreprise avant d'exploiter les résultats selon les conclusions de cette note</font>** . Les modélisations comprennent :
> 
> ·       un modèle statique gravitaire prenant en compte les charges statiques et un module d’Young du béton différé et des raideurs de sol à long terme pour l’IGH R+9 et R+40.
> 
> ·       un modèle sismique prenant en compte un module d’<font color="#2DC26B">Young instantané</font> ~~tenant en compte l’état de fissuration des voiles~~ et des raideurs de sol dynamique pour l’IGH R+9 et R+40.
> 
> ·       un modèle statique vent pour l’IGH R+40 prenant en compte un module d’Young du béton instantané et des raideurs de sol à court terme.
>  
> ·       <font color="#2DC26B">un modèle de modélisation dynamique du vent, en raideur instantanée, avec transmission des données de raideur, masses et amortissement décrivant la brochette de l'IGH40 sur sa verticalité, afin que le consultant en soufflerie en charge d'exploiter les résultats de pesé sur balance haute fréquence puisse interpréter les résultats, avec autant d'itérations que nécessaires jusqu'à résolution de la fonctionnalité dynamique au vent</font>
> 
> ·       <font color="#2DC26B">un ou plusieurs modèles de calcul géotechnique pour modéliser les interactions sol-structure statique et dynamique, conformément aux attendus de l'ingénierie géotechnique indiqués dans les points de vigilance de bouclage APS</font>
> 
> ·       <font color="#2DC26B">un modèle d'analyse des tassements combinés de la structure et du sol support des fondations, réalisé avec prise en compte des séquences de construction des ouvrages, et addition des charges correspondantes à la résolution MEF de chaque phase</font>
>  
> ·       <font color="#2DC26B">un modèle d'analyse de l'intégrité structurelle sous défaillance accidentelle, selon les indications de l'EN1990-1-7§A avec facteurs de sécurité appropriés à l'approche linéaire ou non linéaire qui sera adoptée</font>
> 
> ·       <font color="#2DC26B">les structures métalliques sont de préférence intégrées aux modélisations globales mais pourront faire l'objet d'études séparées pour des raisons pratiques, par l'utilisation de la méthode de transformation spectrale qui sera de rigueur pour tous les ouvrages primaires, sans se soustraire aux impératifs de modélisation des charpentes métalliques de manière fine et cohérente dans les modèles globaux statique, dynamique, séquentiel et accidentels </font>
>
> 
> Afin de déterminer l’état de fissuration des voiles, un premier modèle de calcul sera lancé en se tenant compte sur le module d’Young ~~instantané~~ du béton, puis une comparaison sera effectuée entre les contraintes de traction générées par les forces <font color="#2DC26B">agissantes</font> ~~sismiques~~ et la contrainte limite en traction du béton à l’état ~~ultime accidentelle, qui vaut pour un béton C35/45 : ![](file:///C:/Users/USER/AppData/Local/Temp/msohtmlclip1/01/clip_image002.png) _=_ ![](file:///C:/Users/USER/AppData/Local/Temp/msohtmlclip1/01/clip_image004.png) _= 1.69 MPa_~~ de l'analyse à l'étude de la fissuration
> 
> Si les contraintes de traction générées <font color="#2DC26B">par la grandeur de l'action modélisée dans les combinaison de calcul</font> ~~’action sismique~~ dépassent la valeur de  ![](file:///C:/Users/USER/AppData/Local/Temp/msohtmlclip1/01/clip_image006.png) , l’inertie fissurée sera prise ~~dans le modèle de calcul sismique~~ <font color="#2DC26B">en compte</font>
> 
> Les combinaisons de charges seront faites dans chaque modèle et les valeurs enveloppes par élément seront extraites pour dimensionnement et calcul.

> [!Quote] Déformations
> 
> 1.1.1       Déformations
> 
> La déformation des planchers selon la FD P18-717 sera limitée en tenant compte de la présence d’éléments fragiles :
> 
> Pour les éléments supports reposant sur deux appuis, les valeurs :
> 
> ·      Si ![](file:///C:/Users/USER/AppData/Local/Temp/msohtmlclip1/01/clip_image002.png) 5 m : fnuisible = L/500
> 
> ·      Si ![](file:///C:/Users/USER/AppData/Local/Temp/msohtmlclip1/01/clip_image004.png)5 m : fnuisible = 0.005 + (![](file:///C:/Users/USER/AppData/Local/Temp/msohtmlclip1/01/clip_image006.png))/1000
> 
> Pour les éléments supports en console les valeurs :
> 
> ·      Si ![](file:///C:/Users/USER/AppData/Local/Temp/msohtmlclip1/01/clip_image002.png) 2.5 m : fnuisible = ![](file:///C:/Users/USER/AppData/Local/Temp/msohtmlclip1/01/clip_image006.png)/250 ;
> 
> ·       Sinon : fnuisible = 0.005 + (![](file:///C:/Users/USER/AppData/Local/Temp/msohtmlclip1/01/clip_image006.png))/1000
> 
> Sous ELS QP, la flèche d’un plancher sera limitée à ![](file:///C:/Users/USER/AppData/Local/Temp/msohtmlclip1/01/clip_image006.png)/250, avec L la portée entre deux appuis successifs.
> 
> **NOTA** : Sauf spécifications contraires dans les caractéristiques spécifiques aux systèmes de murs rideaux retenus, les déplacements maximaux nuisibles des planchers seront conformes aux spécifications du NF DTU 33.1 § 5.1.5 et seront ainsi limitées à ± 5 mm pour les façades cadres et à ± 2 mm pour les façades grilles.


> [!warning] Important - Ajouter
> Les façades à l'extrémité des boites flexibles de l'IGH sont conçues avec des cadres admettant des jeux de +/- 10mm par dérogation au DTU mais les façades sur châssis et "stick system" resteront dans des domaines de fonctionnalité plus classique impliquant une rigidité suffisante de la structure tant en flexion de plancher que en tassement différentiels (structurel + géotechnique) qui devra être cadré par le modèle d'analyse séquentielle pour toutes les charges appliquées après la pose des grilles de façade y compris fraction différée des charges durables appliquées avant les grilles de façade
> 
> Les déformations de plancher et les tassements pourront être également limitées, dans les zones d'équipements médicalisés par des limites de flèches et de tassement plus sévères
> 
> Il est recommandé en attente des fiches techniques correspondantes de majorer de 30% les flèches nuisibles en plancher courant pour l'ensemble des plateaux médicalisé.

> [!Quote] Réaction en charge de la nacelle
> 
> ~~FORCE DE LA NACELLE~~
> 
> ~~Une charge permanente uniforme de 10 kN/m² a été retenue au niveau de la dalle de l’édicule du noyau de la tour IGHR40. Cette charge intègre à la fois le poids propre de la nacelle ainsi que l’ensemble des charges permanentes liées à la composition du plancher.~~
> <font color="#2DC26B">> Dans l'attente de la conception du système de maintenance une charge de 10kN/m2 répartie sur la surface de l'édicule, soit une charge totale de XX kN, a été affectée au charges permanentes au stade APS. </font>
> <font color="#2DC26B">> Il sera nécessaire de préciser la faction variable et permanente de ces charges ainsi que leur surface d'influence lorsque les matériels auront été sélectionnés</font>
> 
> 

