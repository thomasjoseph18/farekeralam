🇮🇳 Fare Keralam



Fair fares. Transparent calculations.



Fare Keralam is a Kerala-focused transport fare intelligence and journey-calculation platform designed to make fare calculation simple for passengers and sustainable for drivers.



The system combines verified government fare notifications with continuously monitored operating costs to provide transparent, slab-based fare information.







🎯 Vision



Kerala's transport fares can remain unchanged for long periods while fuel, maintenance, tyres, lubricants and other operating costs change continuously.



Fare Keralam aims to bridge this gap.





Don't wait years to understand changing transport costs. Track them continuously and recommend responsible fare revisions when justified.







Fare Keralam does not replace government fare orders.



Instead, it provides:





The latest applicable government fare



Transparent operating-cost analysis



Sustainable-fare recommendations



Historical fare analysis



Passenger and driver impact analysis











⭐ Core USP



Continuous cost monitoring instead of waiting years for fare revision



The system monitors changes in:





Petrol



Diesel



CNG



Electricity



Tyres



Engine oil/lubricants



Maintenance



Insurance



Depreciation



Other reasonable operating costs







Small daily changes do not automatically change passenger fares.



Instead, Fare Keralam uses a slab-based review system.



Operating costs change

        ↓

Cost index updated

        ↓

Short-term fluctuations filtered

        ↓

Long-term change measured

        ↓

Review threshold checked

        ↓

If threshold is reached

        ↓

Fair fare slab calculated

        ↓

Driver + passenger impact tested

        ↓

Fare Keralam recommendation









🚕 Supported Transport Categories



The platform is designed to support:



Auto





Auto-rickshaw



Quadricycle







Taxi





Motor cab



Tourist taxi



Other applicable taxi categories







Passenger vehicles





Maxicab



Traveller-type vehicles



Other applicable passenger vehicles







Buses





Route/stage carriage buses



Tourist buses



Other applicable bus categories







Future





Electric vehicles



Hybrid vehicles



Additional government-defined categories







Vehicle classifications will follow official regulatory classifications wherever applicable.







🧮 Journey Calculator



Users should not need to understand complicated formulas.



They simply enter:



Vehicle → Auto

Fuel → Petrol

Distance → 20 km





Fare Keralam returns:



Estimated / Official Fare

₹XXX



Minimum/Base Fare

Distance Component

Operating Cost

Driver Sustainability

Fare Status





The system also explains:





How was this fare calculated?







Complex calculations remain in the backend while the interface remains simple.







🏛️ Government Fare Layer



Government fares are treated as the legal reference layer.



Every official fare should contain:



Authority

Notification number

Notification date

Effective date

Vehicle category

Fare structure

Source URL

Verification status

Last verified date





Example:



Official Fare

₹30 minimum



Source:

Kerala Government / Motor Vehicles Department



Notification:

S.R.O. 399/2022



Effective:

01 May 2022





Official data must never be replaced by an assumption.







🔄 Automatic Government Fare Updates



One of Fare Keralam's most important features is automatic updating when the government changes a fare.



The intended architecture is:



Kerala Government / MVD

          ↓

Official source monitoring

          ↓

New notification detected

          ↓

Document retrieved

          ↓

Fare information extracted

          ↓

Notification verified

          ↓

Effective date recorded

          ↓

Database updated

          ↓

Website automatically reflects new fare





Important safety rule



The system must not blindly publish scraped or OCR-generated values as legal fares.



A new government notification should first become a:





Pending verification







record.



After the official notification, fare values and effective date are verified, the new version can be published.







📊 Official Fare vs Fare Keralam Recommendation



This distinction is fundamental.



🟢 Official Fare



The legally applicable fare published by the competent government authority.



🔵 Fare Keralam Recommendation



A transparent analytical estimate based on operating costs.



It is not a government fare.



Example:



Official Kerala Fare

₹30



Fare Keralam Sustainable Estimate

₹35



Reason:

Operating-cost index has increased significantly.





Fare Keralam must never claim that its recommendation is legally enforceable unless the government officially adopts it.







⛽ Operating Cost Model



The operating-cost model can consider:



Fuel

+

Maintenance

+

Tyres

+

Engine oil / lubricants

+

Insurance

+

Taxes / permits where applicable

+

Depreciation

+

Other reasonable operating costs

+

Driver return





The model should use reliable source data wherever available.



Assumptions must be clearly labelled as assumptions.







🚫 No Daily Fare Fluctuation



Fare Keralam is not designed like a stock market.



For example:



Petrol +₹1

       ↓

Fare does NOT automatically increase





Instead:



Daily price changes

       ↓

Operating-cost index

       ↓

Smoothed trend

       ↓

Threshold test

       ↓

Possible fare review





This provides stability for passengers and predictability for drivers.







⚖️ Passenger + Driver Fairness



The system is designed around two objectives.



Driver sustainability



Does the fare provide a reasonable return after operating costs?



Passenger affordability



Is the proposed fare increase proportionate to the underlying cost increase?



A proposed revision should be evaluated against both.



The objective is:





Fair to the passenger. Sustainable for the driver. Evidence-based for policymakers.











📈 Historical Analysis



Fare Keralam will maintain historical fare data.



The system can analyse:





Fare revisions



Fuel prices



Operating costs



Inflation



Maintenance costs



Time between government revisions



Percentage changes



Cost-to-fare relationship







Example:



2016

↓

2018

↓

2022

↓

2026

↓

Future revisions





This allows the project to study whether fare revisions historically kept pace with operating costs.







🧠 Slab-Based Revision Model



Fare Keralam does not recommend continuous small fare changes.



Instead:



Current Fare

     ↓

Cost increase measured

     ↓

Threshold reached?

   ↙       ↘

 NO        YES

 ↓          ↓

No change  Review

             ↓

       New practical slab





The thresholds and formulas must be documented publicly so the system remains auditable.







🔍 Transparency



Every important number should have a source.



Source categories



🟢 Official



Government/MVD notifications and regulatory information.



🔵 Reference



Manufacturer, market or authoritative external data.



🟠 Model



Fare Keralam calculations or assumptions.



Users should always be able to see:





Where did this number come from?











🌐 Data Architecture



The frontend should not contain permanent hard-coded government fares.



Recommended structure:



fare-keralam/

│

├── index.html

├── style.css

├── script.js

│

├── data/

│   ├── official-fares.json

│   ├── fare-history.json

│   ├── vehicle-classes.json

│   ├── fuel-prices.json

│   ├── operating-costs.json

│   └── sources.json

│

├── api/

│   ├── fares

│   ├── fuel

│   ├── sources

│   └── updates

│

├── assets/

│

└── README.md









🔐 Production Data Security



API keys must never be placed in:



script.js

index.html





External APIs requiring authentication should be accessed through a backend.



Example:



User

 ↓

Fare Keralam frontend

 ↓

Fare Keralam API

 ↓

External data provider









🤖 Future Automation



The production system can use scheduled jobs to:





Check official government sources



Detect possible fare notifications



Download new documents



Extract relevant information



Compare with existing fares



Create a pending update



Verify the notification



Record the effective date



Publish the new fare



Preserve the old fare in historical records











📱 User Experience



The interface should remain simple.



Main flow



Choose vehicle

        ↓

Choose fuel

        ↓

Enter distance

        ↓

Calculate

        ↓

See fare

        ↓

Understand why





Users should not need to understand:





JSON



APIs



statistical models



government notification numbers



operating-cost equations







unless they choose "Details" or "How was this calculated?"







🎨 Design Principles



Fare Keralam should be:





Modern



Fast



Mobile-first



Accessible



Easy to understand



Transparent



Professional



Kerala-focused







The website should include:





Smooth scrolling



Responsive design



Dropdown vehicle selection



Subcategory selection



Clear fare cards



Simple charts



Source indicators



Fare history



Explanations



Accessible typography











⚠️ Legal & Data Disclaimer



Fare Keralam is an information and analytical platform.



A Fare Keralam recommendation is not automatically a legally enforceable transport tariff.



Only the competent government authority can establish or revise an official regulated fare.



Government data should always be verified against the latest applicable notification.







🚀 Deployment



The current deployment design serves the frontend and FastAPI backend from one Render web service. GitHub Pages remains available as a static frontend fallback.

### Render service settings

Configure the service from the repository root so the backend can read the root `index.html`, `style.css` and `script.js` files.

- Build command: `pip install -r backend/requirements.txt`
- Start command: `uvicorn backend.main:app --host 0.0.0.0 --port $PORT`
- Environment variable: `DATABASE_URL` set to the PostgreSQL connection string copied from Supabase’s Connect dialog. On Render, use the Session pooler URL on port `5432`; preserve the exact pooler host and project-qualified username Supabase provides. Do not guess the `aws-N` host from the region. A `tenant/user not found` error usually means the host or username does not match the project.

The Render root URL serves the calculator. API endpoints remain under `/api/`, and the interactive API documentation is available at `/docs`.

### Database setup

In the Supabase SQL Editor, apply `database/schema.sql` first, then `database/migrations/002_government_vehicle_classification.sql`. Add active fare rules and slabs only from verified sources. The backend reads `DATABASE_URL`; `SUPABASE_URL` and `SUPABASE_KEY` are not used by this application.

For local development, copy `backend/.env.example` to `backend/.env`. The backend loads that file relative to `backend/main.py`, so the start command works from either the repository root or the `backend` directory. Keep `.env` private and use the Render environment settings for production.

### GitHub Pages fallback

The Pages workflow publishes only the root frontend files. Its frontend calls the Render API, while the Render-hosted frontend uses same-origin `/api` requests. A local preview on ports 3000 or 5500 also calls the Render API.

### Current feature limits

The passenger interface uses the government vehicle hierarchy and does not ask passengers to choose fuel. A hierarchy entry can be calculated only when it maps to an operational category. Database-backed fares are shown when an active, effective fare rule exists. Otherwise, the API labels its configured fallback as an estimate; it is not an official fare.

The full verified fare database, operating-cost recommendation engine, admin dashboard, source-monitoring automation and update-verification workflow remain future work. Do not describe an estimate or an unverified value as a government fare.


🛠️ Development Roadmap



Phase 1 — Foundation





[x] Project concept



[x] Slab-based philosophy



[x] Passenger/driver fairness principle



[x] Official vs analytical fare separation



[ ] Production frontend



[ ] Journey calculator







Phase 2 — Official Data





[ ] Complete Kerala auto fare database



[ ] Complete taxi fare database



[ ] Bus fare database



[ ] Tourist vehicle categories



[ ] Historical fare database



[ ] Source registry







Phase 3 — Cost Engine





[ ] Fuel-price integration



[ ] Tyre-price data



[ ] Engine-oil data



[ ] Maintenance model



[ ] Depreciation model



[ ] Driver-return model







Phase 4 — Intelligence





[ ] Cost index



[ ] Slab threshold engine



[ ] Historical statistical analysis



[ ] Passenger affordability analysis



[ ] Driver sustainability analysis







Phase 5 — Automation





[ ] Government source monitoring



[ ] Notification detection



[ ] Verification workflow



[ ] Effective-date automation



[ ] Automatic website updates







Phase 6 — Production





[ ] Backend API



[ ] Database



[ ] Admin dashboard



[ ] Monitoring



[ ] Error alerts



[ ] Data audit logs



[ ] Production deployment











🌟 Long-Term Vision



Fare Keralam can become more than a fare calculator.



It can become a transparent transport-cost intelligence platform for Kerala.



Passengers can ask:





"How much should this journey cost?"







Drivers can ask:





"Is the current fare sustainable?"







Researchers can ask:





"How have fares changed relative to operating costs?"







Policymakers can ask:





"When is a fare revision economically justified?"











💚 Fare Keralam



Fair fares. Transparent calculations.





Monitor continuously. Adjust responsibly. Keep fares fair.









