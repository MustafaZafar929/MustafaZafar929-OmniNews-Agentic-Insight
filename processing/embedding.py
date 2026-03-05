from sentence_transformers import SentenceTransformer
from sklearn.cluster import DBSCAN
from sklearn.decomposition import PCA
import hdbscan
import matplotlib.pyplot as plt

# -------------------------
# 1. Generate embeddings
# -------------------------
sentences = [
    "Pakistan bombs Kabul, declares 'open war' with Afghanistan after months of border clashes",
    "Jersey votes to approve assisted dying as a similar UK bill stalls in House of Lords",
    "Huawei targets global comeback with Mate 80 Pro smartphone, new smartwatch",
    "Hong Kong ignites next wave of global innovation as Start-up Express 2026 opens for application",
    "China's rare earth curbs hit US aerospace, chips hard despite Trump's trade truce",
    "Hong Kong doctor, clinic operator held over illegal hair transplant procedures",
    "Trump-Xi summit preparations falter as planning gaps unsettle Beijing",
    "Denmark PM calls snap election amid row with Trump over Greenland",
    "Germany's Merz leaves China with stronger ties as Trump trade battle looms",
    "Hong Kong records HK$2.9 billion consolidated surplus for 2025-26. Here's how",
    "Residents of fire-ravaged Wang Fuk Court can retrieve belongings from late April",
    "China's top legislature removes 9 military officials ahead of Beijing's 'two sessions'",
    "World Economic Forum CEO Borge Brende resigns over Epstein revelations",
    "World reacts to eruption of fighting between Pakistan, Afghanistan",
    "Israeli attacks on police sites kill five in southern, central Gaza",
    "Solidarity with Palestinians questioned as Indonesian troops set for Gaza",
    "Canadian PM Carney heads to India on 'significant' trip to consolidate ties",
    "In Gaza, when money is scarce, every choice counts: Bank, cash, or credit?",
    "Russia-Ukraine war: List of key events, day 1,464",
    "Pakistan-Afghanistan live: Islamabad says 'open war'; jets attack Kabul",
    "'Open war': Pakistan says 'patience has run out' as it bombs Afghanistan",
    "US tax agency broke privacy law 'approximately 42,695 times', judge says",
    "Cuba says speedboat attackers from Florida planned to destabilise country",
    "Why are many Western leaders visiting China?",
    "Ecuador hikes tariffs on Colombian imports to 50 percent starting March 1",
    "Israeli attacks on Lebanon's Bekaa Valley kill Syrian teenager",
    "Family of UN rapporteur Albanese sues Trump administration over sanctions",
    "Columbia University says US immigration agents lied to detain student",
    "Iranian foreign minister says US, Iran moving closer to deal",
    "Columbia University students protest ICE arrest at university housing",
    "US-Iran talks conclude with claims of progress but few details",
    "US government asks Supreme Court to allow deportation of Syrian migrants",
    "Kenyan man charged with duping people to fight for Russia in Ukraine war",
    "After State of the Union, Trump's agenda faces new political reality",
    "Journalists demand Israel end Gaza entry ban",
    "How US economic warfare pushed Cuba to humanitarian collapse",
    "International doctors forced to leave Gaza over Israeli demands",
    "Hillary Clinton calls for Trump to testify at US House Epstein hearing",
    "Cuba vows to fight 'terrorist aggression' after attack from US-registered boat",
    "North Korea's 'most beloved' child: what the key congress revealed about Kim Jong-un's succession plans",
    "Boss of theatre hosting Chinese dance group Shen Yun in Sydney won't be intimidated by 'outrageous' threats",
    "News live: South Australia braces for 'highly unpredictable' weekend weather as Sydney commuters urged 'take care' after deluge",
    "Last weekend of summer brings sparkle and stars to Sydney with Mardi Gras parade, Bad Bunny and Grace Jones",
    "NSW government denies 'covering up' deadly fungal outbreak at major hospital",
    "Negative gearing changes on the table before May budget, Jim Chalmers confirms",
    "Burgertory founder's chant about Zionists at pro-Palestine rally incited hatred against Jews, tribunal rules",
    "Firefighters in Sicily rescue 400 rare books from library after landslide",
    "'A living, moving exhibition': Ukraine Museum opens in Berlin air-raid bunker",
    "Mandelson faces EU inquiry into Brussels trade role over Epstein links",
    "EU opens up funding to guarantee abortion rights across bloc",
    "US-Iran nuclear talks end without a deal as threat of war grows",
    "Pakistan bombs Kabul after intensifying border clashes with Afghanistan",
    "Polanski says Greens best party to defeat Reform after Spencer wins Gorton and Denton – UK politics live",
    "Green party wins Gorton and Denton byelection, pushing Labour to third place in blow to Keir Starmer",
    "Vegetarians have 'substantially lower risk' of five types of cancer",
    "Observers raise concerns over secret ballot breaches at Gorton and Denton byelection",
    "Kinship carers in England to be given financial support in government pilot",
    "Texas airspace closed after military reportedly downs US drone on accident",
    "Woman at heart of US trial says she was addicted to social media at age six",
    "Burger King cooks up AI chatbot to spot if employees say 'please' and 'thank you'",
    "Netflix declines to match Paramount offer for Warner Bros Discovery",
    "Global stock discounts vs US stock discounts",
    "China's central bank moves to slow renminbi's advance",
    "EU Commission eyes legal loophole to bypass Hungary veto of €90bn loan",
    "FirstFT: Greens deal by-election blow to Labour",
    "Bank of Japan to press on with April rate rise",
    "Pakistan bombs Kabul and Taliban strongholds",
    "Private equity's problems explained in one blow-up",
    "Economic nationalism is just getting started",
    "Pentagon moves to build AI tools for China cyber operations",
    "In Perpignan, French far right stakes its claim to power",
    "Bezos's $30bn AI lab seeking tens of billions for industrial sector deals",
    "Power failure could undermine America's AI ambitions",
    "In the Dolomites, a thousand-year-old castle is reborn as an indulgent retreat",
    "Banshee — Irish myths get timely makeover",
    "How China's universities joined the global elite",
    "Could common debt make the EU stronger? With Carlos Cuerpo",
    "Greens win key UK by-election in blow to Labour",
    "China sacks 9 senior military officers as Xi widens crackdown",
    "The activist vs the carmaker: how Elliott forced Toyota into $35bn showdown",
    "AI will not kill jobs in India's outsourcing sector, says WNS chief",
    "US warns it will axe all Anthropic agreements without Pentagon deal",
    "Trump and Mamdani discuss housing and immigration in second meeting",
    "The companies behind China's dancing, joking robots",
    "Paramount clinches Warner Bros deal after Netflix walks away",
    "Bayeux Tapestry to be sponsored by Belarus-born hedge fund billionaire",
    "Draft Order to Declare National Emergency on Elections Circulating Trump Allies",
    "Judge Rules ICE's 'Third-Country' Deportations Are Unconstitutional",
    "Organizers Celebrate Palantir Headquarters' Move From Denver After Protests",
    "Columbia Student Taken by DHS Agents Who Reportedly Lied to Enter Residence",
    "Robin D. G. Kelley: It's Not Enough to Abolish ICE — We Have to Abolish Police",
    "Committee to Protect Journalists Reports a Record 129 Journalists Killed in 2025",
    "Kansas Invalidates Transgender People's IDs After GOP Legislature Passes New Law",
    "Omar Demands Probe After Police Brutally Arrest State of the Union Guest",
    "Israeli Settlers Killed Palestinian American Teen in Rising Assault on West Bank",
    "Pentagon-Backed Supercomputer Project Could Price Out Black Residents in Chicago",
    "Wesley Hunt points to Vance, Scott in defending missed votes",
    "US military shot down border patrol drone with laser in Texas, lawmakers say",
    "Vance: 'No chance' any Iran strikes would lead to long war in Middle East",
    "Tampa man killed in Cuban boat shootout wanted to overthrow island's government, loved ones say"
]



model = SentenceTransformer("all-MiniLM-L6-v2")

embeddings = model.encode(
    sentences,
    normalize_embeddings=True  # IMPORTANT for DBSCAN + cosine
)   

# -------------------------
# 2. Run DBSCAN
# -------------------------
dbscan = DBSCAN(
    eps=0.4,          # distance threshold (tune this!)
    min_samples=2,
    metric="cosine"
)

labels = dbscan.fit_predict(embeddings)

print("Cluster labels:")
for s, l in zip(sentences, labels):
    print(f"{l}: {s}")

# -------------------------
# 3. Reduce to 2D for visualization
# -------------------------
pca = PCA(n_components=2)
embeddings_2d = pca.fit_transform(embeddings)

# -------------------------
# 4. Plot
# -------------------------
plt.figure(figsize=(8, 6))

unique_labels = set(labels)

for label in unique_labels:
    idxs = labels == label

    if label == -1:
        # Noise points
        plt.scatter(
            embeddings_2d[idxs, 0],
            embeddings_2d[idxs, 1],
            c="gray",
            marker="x",
            label="Noise"
        )
    else:
        plt.scatter(
            embeddings_2d[idxs, 0],
            embeddings_2d[idxs, 1],
            label=f"Cluster {label}"
        )

# Annotate points
for i, sentence in enumerate(sentences):
    plt.annotate(sentence, (embeddings_2d[i, 0], embeddings_2d[i, 1]), fontsize=8)

plt.title("DBSCAN Clustering of Sentence Embeddings")
plt.legend()
plt.tight_layout()
plt.show()
