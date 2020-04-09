import Encoder from './Encoder';
import ErrorCode from './ErrorCode';
import JsonAsync from './util/JsonAsync';
import Jws from './util/Jws';
import Operation from './Operation';
import OperationModel from './models/OperationModel';
import OperationType from '../../enums/OperationType';
import SidetreeError from '../../../common/SidetreeError';

interface SignedDataModel {
  didUniqueSuffix: string;
  recoveryRevealValue: string;
}

/**
 * A class that represents a revoke operation.
 */
export default class RevokeOperation implements OperationModel {

  /** The original request buffer sent by the requester. */
  public readonly operationBuffer: Buffer;

  /** The unique suffix of the DID. */
  public readonly didUniqueSuffix: string;

  /** The type of operation. */
  public readonly type: OperationType;

  /** Encoded reveal value for the operation. */
  public readonly recoveryRevealValue: string;

  /** Signed data. */
  public readonly signedDataJws: Jws;

  /** Decoded signed data payload. */
  public readonly signedData: SignedDataModel;

  /**
   * NOTE: should only be used by `parse()` and `parseObject()` else the contructed instance could be invalid.
   */
  private constructor (
    operationBuffer: Buffer,
    didUniqueSuffix: string,
    recoveryRevealValue: string,
    signedDataJws: Jws,
    signedData: SignedDataModel
  ) {
    this.operationBuffer = operationBuffer;
    this.type = OperationType.Revoke;
    this.didUniqueSuffix = didUniqueSuffix;
    this.recoveryRevealValue = recoveryRevealValue;
    this.signedDataJws = signedDataJws;
    this.signedData = signedData;
  }

  /**
   * Parses the given input as a revoke operation entry in the anchor file.
   */
  public static async parseOpertionFromAnchorFile (input: any): Promise<RevokeOperation> {
    const opertionBuffer = Buffer.from(JSON.stringify(input));
    const operation = await RevokeOperation.parseObject(input, opertionBuffer, true);
    return operation;
  }

  /**
   * Parses the given buffer as a `UpdateOperation`.
   */
  public static async parse (operationBuffer: Buffer): Promise<RevokeOperation> {
    const operationJsonString = operationBuffer.toString();
    const operationObject = await JsonAsync.parse(operationJsonString);
    const revokeOperation = await RevokeOperation.parseObject(operationObject, operationBuffer, false);
    return revokeOperation;
  }

  /**
   * Parses the given operation object as a `RevokeOperation`.
   * The `operationBuffer` given is assumed to be valid and is assigned to the `operationBuffer` directly.
   * NOTE: This method is purely intended to be used as an optimization method over the `parse` method in that
   * JSON parsing is not required to be performed more than once when an operation buffer of an unknown operation type is given.
   * @param anchorFileMode If set to true, then `type` is expected to be absent.
   */
  public static async parseObject (operationObject: any, operationBuffer: Buffer, anchorFileMode: boolean): Promise<RevokeOperation> {
    let expectedPropertyCount = 4;
    if (anchorFileMode) {
      expectedPropertyCount = 3;
    }

    const properties = Object.keys(operationObject);
    if (properties.length !== expectedPropertyCount) {
      throw new SidetreeError(ErrorCode.RevokeOperationMissingOrUnknownProperty);
    }

    if (typeof operationObject.didUniqueSuffix !== 'string') {
      throw new SidetreeError(ErrorCode.RevokeOperationMissingOrInvalidDidUniqueSuffix);
    }

    if (typeof operationObject.recoveryRevealValue !== 'string') {
      throw new SidetreeError(ErrorCode.RevokeOperationRecoveryRevealValueMissingOrInvalidType);
    }

    if ((operationObject.recoveryRevealValue as string).length > Operation.maxEncodedRevealValueLength) {
      throw new SidetreeError(ErrorCode.RevokeOperationRecoveryRevealValueTooLong);
    }

    const recoveryRevealValue = operationObject.recoveryRevealValue;

    const signedDataJws = Jws.parse(operationObject.signedData);
    const signedData = await RevokeOperation.parseSignedDataPayload(
      signedDataJws.payload, operationObject.didUniqueSuffix, recoveryRevealValue);

    // If not in anchor file mode, we need to validate `type` property.
    if (!anchorFileMode) {
      if (operationObject.type !== OperationType.Revoke) {
        throw new SidetreeError(ErrorCode.RevokeOperationTypeIncorrect);
      }
    }

    return new RevokeOperation(
      operationBuffer,
      operationObject.didUniqueSuffix,
      recoveryRevealValue,
      signedDataJws,
      signedData
    );
  }

  private static async parseSignedDataPayload (
    patchDataEncodedString: string, expectedDidUniqueSuffix: string, expectedRecoveryRevealValue: string): Promise<SignedDataModel> {

    const signedDataJsonString = Encoder.decodeAsString(patchDataEncodedString);
    const signedData = await JsonAsync.parse(signedDataJsonString);

    const properties = Object.keys(signedData);
    if (properties.length !== 2) {
      throw new SidetreeError(ErrorCode.RevokeOperationSignedDataMissingOrUnknownProperty);
    }

    if (signedData.didUniqueSuffix !== expectedDidUniqueSuffix) {
      throw new SidetreeError(ErrorCode.RevokeOperationSignedDidUniqueSuffixMismatch);
    }

    if (signedData.recoveryRevealValue !== expectedRecoveryRevealValue) {
      throw new SidetreeError(ErrorCode.RevokeOperationSignedRecoveryRevealValueMismatch);
    }

    return signedData;
  }
}