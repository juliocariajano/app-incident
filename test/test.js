// test/test.js
const cds = require('@sap/cds')

// Arranca el servidor de prueba sobre la raíz del proyecto
const { GET, POST, PATCH, DELETE, expect, SELECT } = cds.test(__dirname + '/..')

// usuario con rol 'support' (según package.json -> cds.requires.auth.users)
const AUTH = { auth: { username: 'julio' } }

jest.setTimeout(30000)

describe('Test The GET Endpoints', () => {
  it('Should check Processor Service', async () => {
    const processorService = await cds.connect.to('ProcessorService')
    const { Incidents } = processorService.entities
    const rows = await SELECT.from(Incidents)
    expect(rows).to.have.length(4) // ajusta si tus CSV cambian
  })

  it('Should check Customers', async () => {
    const processorService = await cds.connect.to('ProcessorService')
    const { Customers } = processorService.entities
    const rows = await SELECT.from(Customers)
    expect(rows).to.have.length(3) // ajusta si tus CSV cambian
  })

  it('Test Expand Entity Endpoint', async () => {
    const res = await GET(
      `/odata/v4/processor/Customers?$select=firstName&$expand=incidents`,
      AUTH
    )
    expect(res.status).to.equal(200)
    expect(res.data).to.be.an('object')
  })
})

describe('Draft Choreography APIs', () => {
  let draftId, incidentId

  it('Create an incident (draft)', async () => {
    const res = await POST(`/odata/v4/processor/Incidents`, {
      title: 'Urgent attention required !',
      status_code: 'N'
    }, AUTH)
    expect(res.status).to.equal(201)
    draftId = res.data.ID
    expect(draftId).to.be.ok()
  })

  it('Activate the draft & check urgency set by custom logic', async () => {
    const res = await POST(
      `/odata/v4/processor/Incidents(ID=${draftId},IsActiveEntity=false)/ProcessorService.draftActivate`,
      null,
      AUTH
    )
    expect(res.status).to.equal(201)
    expect(res.data.urgency_code).to.eql('H')
  })

  it('Read active incident and verify status', async () => {
    const res = await GET(
      `/odata/v4/processor/Incidents(ID=${draftId},IsActiveEntity=true)`,
      AUTH
    )
    expect(res.status).to.eql(200)
    expect(res.data.status_code).to.eql('N')
    incidentId = res.data.ID
  })

  describe('Close Incident and try to re-open to trigger custom error', () => {
    it('Enter draft mode on active incident', async () => {
      const res = await POST(
        `/odata/v4/processor/Incidents(ID=${incidentId},IsActiveEntity=true)/ProcessorService.draftEdit`,
        { PreserveChanges: true },
        AUTH
      )
      expect(res.status).to.equal(201)
    })

    it('Patch draft to closed (C)', async () => {
      const res = await PATCH(
        `/odata/v4/processor/Incidents(ID=${incidentId},IsActiveEntity=false)`,
        { status_code: 'C' },
        AUTH
      )
      expect(res.status).to.equal(200)
    })

    it('Activate draft (should succeed)', async () => {
      const res = await POST(
        `/odata/v4/processor/Incidents(ID=${incidentId},IsActiveEntity=false)/ProcessorService.draftActivate`,
        null,
        AUTH
      )
      expect(res.status).to.eql(200)
    })

    it('Verify incident is closed', async () => {
      const res = await GET(
        `/odata/v4/processor/Incidents(ID=${incidentId},IsActiveEntity=true)`,
        AUTH
      )
      expect(res.status).to.eql(200)
      expect(res.data.status_code).to.eql('C')
    })

    it('Try to re-open a closed incident → expect business error', async () => {
      // draftEdit again
      const res1 = await POST(
        `/odata/v4/processor/Incidents(ID=${incidentId},IsActiveEntity=true)/ProcessorService.draftEdit`,
        { PreserveChanges: true },
        AUTH
      )
      expect(res1.status).to.equal(201)

      // attempt to set status back to 'N'
      const res2 = await PATCH(
        `/odata/v4/processor/Incidents(ID=${incidentId},IsActiveEntity=false)`,
        { status_code: 'N' },
        AUTH
      )
      expect(res2.status).to.equal(200)

      // activation should FAIL -> helper lanza excepción, la capturamos:
      try {
        await POST(
          `/odata/v4/processor/Incidents(ID=${incidentId},IsActiveEntity=false)/ProcessorService.draftActivate`,
          null,
          AUTH
        )
        throw new Error('Expected activation to fail but it succeeded')
      } catch (e) {
        const { response } = e
        expect(response.status).to.eql(500)
        expect(response.data.error.message).to.include(`Can't modify a closed incident`)
      }
    })
  })

  it('Delete the (remaining) draft if any', async () => {
    const res = await DELETE(
      `/odata/v4/processor/Incidents(ID=${draftId},IsActiveEntity=false)`,
      AUTH
    )
    // Si no existe, algunos runtimes devuelven 404; ajusta si tu lógica lo elimina antes.
    expect([204, 404]).to.contain(res.status)
  })

  it('Delete the active incident', async () => {
    const res = await DELETE(
      `/odata/v4/processor/Incidents(ID=${incidentId},IsActiveEntity=true)`,
      AUTH
    )
    expect(res.status).to.eql(204)
  })
})
