/** Legendary Dianamon — drifting snow across the fill and a half moon in the top-right. */
const SNOWFLAKE_SLOTS = [
  'meter-party-dianamon-snowflake--1',
  'meter-party-dianamon-snowflake--2',
  'meter-party-dianamon-snowflake--3',
  'meter-party-dianamon-snowflake--4',
  'meter-party-dianamon-snowflake--5',
  'meter-party-dianamon-snowflake--6',
  'meter-party-dianamon-snowflake--7',
  'meter-party-dianamon-snowflake--8',
  'meter-party-dianamon-snowflake--9',
  'meter-party-dianamon-snowflake--10',
  'meter-party-dianamon-snowflake--11',
  'meter-party-dianamon-snowflake--12',
] as const

export function MeterDianamonLegendaryFx() {
  return (
    <div className="meter-party-dianamon-fx" aria-hidden>
      <div className="meter-party-dianamon-snow">
        {SNOWFLAKE_SLOTS.map((slot) => (
          <span key={slot} className={`meter-party-dianamon-snowflake ${slot}`} />
        ))}
      </div>
      <div className="meter-party-dianamon-moon" />
    </div>
  )
}
